"""
P2PT Sync Provider for Pycrdt

A pycrdt provider that uses WebTorrent-based P2P for peer discovery
and synchronization via WebRTC data channels.

Protocol messages use 32-bit type codes:
- 0x01: CHALLENGE - Authentication challenge
- 0x02: CHALLENGE_RESP - Challenge response (HMAC-SHA256)
- 0x03: STATE_VECTOR - Request/send state vector
- 0x04: STATE_UPDATE - State update (full or diff)
- 0x05: DOC_UPDATE - Document update
- 0x06: AWARENESS_UPDATE - Awareness protocol update
"""

import asyncio
import base64
import hashlib
import hmac
import json
import secrets
import struct
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Set, Awaitable
from urllib.parse import urlparse

import aiohttp
from aiortc import RTCPeerConnection, RTCDataChannel, RTCSessionDescription
from aiortc.contrib.media import MediaBlackhole
from aiortc.sdp import candidate_from_sdp, candidate_to_sdp

import pycrdt
from pycrdt import Doc
from pycrdt.operations import Operation

# Message type codes
MSG_CHALLENGE = 0x01
MSG_CHALLENGE_RESP = 0x02
MSG_STATE_VECTOR = 0x03
MSG_STATE_UPDATE = 0x04
MSG_DOC_UPDATE = 0x05
MSG_AWARENESS_UPDATE = 0x06

# Default WebTorrent tracker URLs
DEFAULT_TRACKERS = [
    "wss://tracker.openwebtorrent.com",
    "wss://tracker.webtorrent.dev:443"
]

# Validation timeout in milliseconds
PEER_VALIDATION_TIMEOUT = 60000

# Exponential backoff settings
INITIAL_RECONNECT_DELAY = 1.0
MAX_RECONNECT_DELAY = 60.0
RECONNECT_MULTIPLIER = 2.0


def sha256(message: str) -> str:
    """Compute SHA-256 hash and return as hex string."""
    return hashlib.sha256(message.encode()).hexdigest()


def hmac_sha256(key: bytes, message: bytes) -> bytes:
    """Compute HMAC-SHA256."""
    return hmac.new(key, message, hashlib.sha256).digest()


def hex_to_bytes(hex_str: str) -> bytes:
    """Convert hex string to bytes."""
    return bytes.fromhex(hex_str)


def bytes_to_hex(data: bytes) -> str:
    """Convert bytes to hex string."""
    return data.hex()


def parse_message(data: bytes) -> Optional[tuple[int, bytes]]:
    """
    Parse a message from bytes.
    Format: [type: 4 bytes][length: 4 bytes][payload: length bytes]
    """
    if len(data) < 8:
        return None
    type_code = struct.unpack("<I", data[0:4])[0]
    length = struct.unpack("<I", data[4:8])[0]
    if len(data) < 8 + length:
        return None
    payload = data[8 : 8 + length]
    return (type_code, payload)


def create_message(type_code: int, payload: bytes) -> bytes:
    """Create a message bytes."""
    header = struct.pack("<II", type_code, len(payload))
    return header + payload


def encode_state_vector(doc: Doc) -> bytes:
    """Encode document state vector."""
    # Get all known clocks from the doc
    state = {}
    for key in doc._subdocs:
        subdoc = doc._subdocs.get(key)
        if subdoc:
            state[key] = subdoc.clock
    return json.dumps(state).encode()


def encode_state_as_update(doc: Doc, state_vector: bytes) -> bytes:
    """
    Encode state as update relative to a state vector.
    Returns updates that the peer needs but we have.
    """
    try:
        remote_state = json.loads(state_vector.decode()) if state_vector else {}
    except (json.JSONDecodeError, UnicodeDecodeError):
        remote_state = {}

    # Collect all updates since the remote state
    # For now, encode the entire doc state as update
    updates = []
    for key, value in doc._data.items():
        updates.append((key, value))

    return json.dumps(updates).encode()


def apply_update(doc: Doc, update: bytes, origin: Any = None) -> None:
    """Apply an update to the document."""
    try:
        updates = json.loads(update.decode())
        with doc.transaction():
            for key, value in updates:
                doc._data[key] = value
    except (json.JSONDecodeError, UnicodeDecodeError, Exception) as e:
        print(f"[P2PT] Failed to apply update: {e}")


@dataclass
class PeerConnection:
    """Peer connection state."""
    peer_id: str
    validated: bool = False
    queued_messages: List[bytes] = field(default_factory=list)
    data_channel: Optional[RTCDataChannel] = None
    validation_timer: Optional[asyncio.Task] = None
    challenge: Optional[str] = None

    def __post_init__(self):
        if self.queued_messages is None:
            self.queued_messages = []


@dataclass
class TrackerMessage:
    """Incoming message from tracker."""
    action: str
    info_hash: str
    peer_id: Optional[str] = None
    offer: Optional[str] = None
    answer: Optional[str] = None
    message: Optional[str] = None
    peers: Optional[List[Dict]] = None
    complete: Optional[int] = None
    incomplete: Optional[int] = None


class TrackerManager:
    """
    Manages WebSocket connections to WebTorrent trackers.
    
    Provides:
    - WebSocket connections to multiple trackers with exponential backoff
    - Subscriber system to receive offers by info_hash
    - Message routing to appropriate subscribers
    """

    def __init__(
        self,
        tracker_urls: Optional[List[str]] = None,
        peer_id: Optional[str] = None,
        on_status_change: Optional[Callable[[dict], None]] = None,
    ):
        """
        Initialize the TrackerManager.
        
        Args:
            tracker_urls: List of WebSocket tracker URLs
            peer_id: Our peer ID (generated if not provided)
            on_status_change: Callback for status changes
        """
        self.tracker_urls = tracker_urls or DEFAULT_TRACKERS
        self.peer_id = peer_id or secrets.token_hex(20)
        self.on_status_change = on_status_change

        # Connected trackers: {tracker_url: websocket}
        self._connections: Dict[str, asyncio.WebSocketServerProtocol] = {}
        
        # Reconnection state per tracker
        self._reconnect_delays: Dict[str, float] = {}
        
        # Subscribers: {info_hash: {subscriber_id: callback}}
        # Callbacks receive (subscriber_id, TrackerMessage)
        self._subscribers: Dict[str, Dict[str, Callable]] = {}
        
        # Tasks for each tracker connection
        self._tracker_tasks: Dict[str, asyncio.Task] = {}
        
        self._running = False
        self._lock = asyncio.Lock()

    @property
    def connected_trackers(self) -> List[str]:
        """List of currently connected tracker URLs."""
        return list(self._connections.keys())

    async def start(self) -> None:
        """Start connecting to all trackers."""
        if self._running:
            return
        self._running = True
        
        # Connect to all trackers
        for tracker_url in self.tracker_urls:
            await self._connect_tracker(tracker_url)
        
        self._notify_status()

    async def stop(self) -> None:
        """Stop all tracker connections."""
        self._running = False
        
        # Cancel all tracker tasks
        for task in self._tracker_tasks.values():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        
        self._tracker_tasks.clear()
        
        # Close all connections
        for ws in self._connections.values():
            await ws.close()
        self._connections.clear()
        
        self._notify_status()

    async def _connect_tracker(self, tracker_url: str) -> None:
        """Connect to a single tracker with exponential backoff."""
        if tracker_url in self._tracker_tasks:
            return  # Already connecting/connected
        
        async def connect_loop():
            delay = INITIAL_RECONNECT_DELAY
            
            while self._running:
                try:
                    # Parse WebSocket URL
                    parsed = urlparse(tracker_url)
                    if parsed.scheme == "wss":
                        ws_url = tracker_url
                    else:
                        ws_url = f"wss://{parsed.netloc}/announce/{self.peer_id}"
                    
                    print(f"[TrackerManager] Connecting to {tracker_url}")
                    
                    async with asyncio.timeout(10):
                        ws = await asyncio.get_event_loop().run_in_executor(
                            None,
                            lambda: asyncio.WebSocketClientProtocol()
                        )
                        # Note: For real implementation, use aiohttp WS client
                        # This is simplified - using aiohttp instead
                    
                    # Use aiohttp WebSocket
                    async with aiohttp.ClientSession() as session:
                        async with session.ws_connect(ws_url, autoclose=False) as ws:
                            async with self._lock:
                                self._connections[tracker_url] = ws
                                self._reconnect_delays[tracker_url] = INITIAL_RECONNECT_DELAY
                            
                            print(f"[TrackerManager] Connected to {tracker_url}")
                            self._notify_status()
                            
                            # Handle incoming messages
                            async for msg in ws:
                                if msg.type == aiohttp.WSMsgType.TEXT:
                                    try:
                                        data = json.loads(msg.data)
                                        await self._handle_message(tracker_url, data)
                                    except json.JSONDecodeError:
                                        print(f"[TrackerManager] Invalid JSON from {tracker_url}")
                                elif msg.type == aiohttp.WSMsgType.ERROR:
                                    print(f"[TrackerManager] WS error from {tracker_url}")
                                    break
                            
                except asyncio.CancelledError:
                    break
                except Exception as e:
                    print(f"[TrackerManager] Error connecting to {tracker_url}: {e}")
                
                # Exponential backoff
                if self._running:
                    async with self._lock:
                        current_delay = self._reconnect_delays.get(tracker_url, INITIAL_RECONNECT_DELAY)
                        delay = min(current_delay * RECONNECT_MULTIPLIER, MAX_RECONNECT_DELAY)
                        self._reconnect_delays[tracker_url] = delay
                    
                    print(f"[TrackerManager] Reconnecting to {tracker_url} in {delay}s")
                    await asyncio.sleep(delay)
            
            # Clean up on exit
            async with self._lock:
                self._connections.pop(tracker_url, None)
                self._tracker_tasks.pop(tracker_url, None)
                self._reconnect_delays.pop(tracker_url, None)
            
            self._notify_status()

        task = asyncio.create_task(connect_loop())
        self._tracker_tasks[tracker_url] = task

    async def _handle_message(self, tracker_url: str, data: dict) -> None:
        """Handle incoming message from tracker."""
        try:
            msg = TrackerMessage(
                action=data.get("action", ""),
                info_hash=data.get("info_hash", ""),
                peer_id=data.get("peer_id"),
                offer=data.get("offer"),
                answer=data.get("answer"),
                message=data.get("message"),
                peers=data.get("peers"),
                complete=data.get("complete"),
                incomplete=data.get("incomplete"),
            )
        except Exception as e:
            print(f"[TrackerManager] Failed to parse message: {e}")
            return

        # Route to subscribers for this info_hash
        info_hash = msg.info_hash
        async with self._lock:
            subscribers = self._subscribers.get(info_hash, {}).copy()
        
        for subscriber_id, callback in subscribers.items():
            try:
                if asyncio.iscoroutinefunction(callback):
                    await callback(subscriber_id, msg)
                else:
                    callback(subscriber_id, msg)
            except Exception as e:
                print(f"[TrackerManager] Subscriber error: {e}")

    async def subscribe(
        self, 
        info_hash: str, 
        subscriber_id: str, 
        callback: Callable[[str, TrackerMessage], Awaitable[None]]
    ) -> None:
        """
        Subscribe to messages for a specific info_hash.
        
        Args:
            info_hash: The torrent info_hash to subscribe to
            subscriber_id: Unique ID for this subscriber
            callback: Async function called with (subscriber_id, TrackerMessage)
        """
        async with self._lock:
            if info_hash not in self._subscribers:
                self._subscribers[info_hash] = {}
            self._subscribers[info_hash][subscriber_id] = callback

    async def unsubscribe(self, info_hash: str, subscriber_id: str) -> None:
        """Unsubscribe from messages for an info_hash."""
        async with self._lock:
            if info_hash in self._subscribers:
                self._subscribers[info_hash].pop(subscriber_id, None)
                if not self._subscribers[info_hash]:
                    del self._subscribers[info_hash]

    async def announce(
        self,
        info_hash: str,
        offer: Optional[str] = None,
        answer: Optional[str] = None,
        message: Optional[str] = None,
    ) -> None:
        """
        Send an announce message to all connected trackers.
        
        Args:
            info_hash: The torrent info_hash
            offer: WebRTC offer (base64 encoded SDP)
            answer: WebRTC answer (base64 encoded SDP)
            message: Data channel message
        """
        payload = {
            "action": "announce",
            "info_hash": info_hash,
            "peer_id": self.peer_id,
        }
        
        if offer is not None:
            payload["offer"] = offer
        if answer is not None:
            payload["answer"] = answer
        if message is not None:
            payload["message"] = message

        msg_json = json.dumps(payload)
        
        async with self._lock:
            connections = list(self._connections.values())
        
        for ws in connections:
            try:
                await ws.send_str(msg_json)
            except Exception as e:
                print(f"[TrackerManager] Failed to send announce: {e}")

    def _notify_status(self) -> None:
        """Notify status change callback."""
        if self.on_status_change:
            self.on_status_change({
                "connected": len(self._connections) > 0,
                "trackers": list(self._connections.keys()),
                "peer_id": self.peer_id,
            })


class SyncKeyData:
    """Per-sync-key data."""
    def __init__(self, sync_key: str, info_hash: str, subscriber_id: str):
        self.sync_key = sync_key
        self.info_hash = info_hash
        self.subscriber_id = subscriber_id
        self.peers: Dict[str, PeerConnection] = {}
        self.peer_id_to_sync_key: Dict[str, str] = {}
        self.local_peer_id: Optional[str] = None


class P2PTSyncProvider:
    """
    P2PT Sync Provider for Pycrdt.

    A pycrdt provider that uses WebTorrent for peer discovery
    and WebRTC for P2P synchronization.
    """

    def __init__(
        self,
        ydoc: Doc,
        sync_keys: List[str],
        tracker_urls: Optional[List[str]] = None,
        on_status_change: Optional[Callable[[dict], None]] = None,
    ):
        """
        Initialize the P2PT sync provider.

        Args:
            ydoc: The pycrdt document to sync.
            sync_keys: Array of sync keys (shared secrets) to participate in.
            tracker_urls: Optional array of WebTorrent tracker URLs.
            on_status_change: Optional callback for status changes.
        """
        self.ydoc = ydoc
        self.tracker_urls = tracker_urls or DEFAULT_TRACKERS
        self.on_status_change = on_status_change

        # Create TrackerManager
        self._tracker = TrackerManager(
            tracker_urls=self.tracker_urls,
            on_status_change=self._on_tracker_status,
        )

        self._sync_key_data: Dict[str, SyncKeyData] = {}
        self._destroyed = False
        self._doc_observer: Optional[Callable] = None
        self._awareness_state: Dict[str, Any] = {}

        # Subscribe to doc updates
        if hasattr(ydoc, 'observe'):
            self._doc_observer = self._handle_doc_change
            ydoc.observe(self._doc_observer)

        # Create sync key data for each key
        for sync_key in sync_keys:
            self._create_sync_key_data(sync_key)

    def _on_tracker_status(self, status: dict) -> None:
        """Handle tracker status changes."""
        self._notify_status_change()

    def _create_sync_key_data(self, sync_key: str) -> SyncKeyData:
        """Create sync key data with hashed info hash."""
        info_hash = sha256(sync_key)[:40]
        subscriber_id = secrets.token_hex(8)
        data = SyncKeyData(sync_key, info_hash, subscriber_id)
        self._sync_key_data[sync_key] = data
        print(f"[P2PT] Created sync key: {sync_key[:8]}... -> {info_hash[:8]}...")
        
        # Subscribe to offers for this info_hash
        self._tracker.subscribe(info_hash, subscriber_id, self._handle_tracker_message)
        
        return data

    async def start(self) -> None:
        """Start the provider."""
        if self._destroyed:
            return
        
        await self._tracker.start()
        print("[P2PT] Started")
        self._notify_status_change()

    def add_sync_key(self, sync_key: str) -> None:
        """Add a new sync key to participate in."""
        if sync_key in self._sync_key_data or self._destroyed:
            return

        self._create_sync_key_data(sync_key)
        self._notify_status_change()

    def remove_sync_key(self, sync_key: str) -> None:
        """Remove a sync key."""
        data = self._sync_key_data.get(sync_key)
        if not data:
            return

        # Unsubscribe from tracker
        self._tracker.unsubscribe(data.info_hash, data.subscriber_id)

        # Remove all peers
        for peer_id in list(data.peers.keys()):
            self._remove_peer(sync_key, peer_id)

        self._sync_key_data.pop(sync_key, None)
        self._notify_status_change()

    async def _handle_tracker_message(self, subscriber_id: str, msg: TrackerMessage) -> None:
        """Handle incoming tracker message."""
        # Find the sync key for this subscriber
        sync_key = None
        for sk, data in self._sync_key_data.items():
            if data.subscriber_id == subscriber_id:
                sync_key = sk
                break
        
        if not sync_key:
            return

        if msg.action == "announce":
            if msg.offer:
                # Received an offer - create answer
                await self._handle_offer(sync_key, msg.peer_id, msg.offer)
            elif msg.answer:
                # Received an answer - complete connection
                await self._handle_answer(sync_key, msg.peer_id, msg.answer)
            elif msg.message:
                # Direct message from peer
                await self._handle_peer_message(sync_key, msg.peer_id, msg.message)

    async def _handle_offer(self, sync_key: str, peer_id: str, offer_sdp: str) -> None:
        """Handle incoming WebRTC offer."""
        data = self._sync_key_data.get(sync_key)
        if not data:
            return
        
        print(f"[P2PT] Received offer from {peer_id[:8]}...")
        
        try:
            # Decode offer
            offer_data = json.loads(base64.b64decode(offer_sdp).decode())
            
            # Create RTCPeerConnection
            pc = RTCPeerConnection()
            
            # Set up data channel
            @pc.on("datachannel")
            def on_datachannel(channel: RTCDataChannel):
                asyncio.create_task(self._handle_data_channel(sync_key, peer_id, channel))
            
            @pc.on("iceconnectionstatechange")
            def on_ice_state():
                print(f"[P2PT] ICE state for {peer_id[:8]}: {pc.iceConnectionState}")
            
            # Set remote description
            await pc.setRemoteDescription(RTCSessionDescription(
                sdp=offer_data["sdp"],
                type="offer"
            ))
            
            # Create answer
            answer = await pc.createAnswer()
            await pc.setLocalDescription(answer)
            
            # Send answer via tracker
            answer_sdp = base64.b64encode(json.dumps({
                "sdp": pc.localDescription.sdp,
                "type": pc.localDescription.type
            }).encode()).decode()
            
            await self._tracker.announce(data.info_hash, answer=answer_sdp)
            
            print(f"[P2PT] Sent answer to {peer_id[:8]}...")
            
        except Exception as e:
            print(f"[P2PT] Error handling offer: {e}")

    async def _handle_answer(self, sync_key: str, peer_id: str, answer_sdp: str) -> None:
        """Handle incoming WebRTC answer."""
        # This would need to track pending offers
        # For now, simplified - full implementation would track offer/answer pairs
        print(f"[P2PT] Received answer from {peer_id[:8]}...")

    async def _handle_peer_message(self, sync_key: str, peer_id: str, message: str) -> None:
        """Handle direct peer message via tracker."""
        try:
            data_bytes = base64.b64decode(message)
            await self._handle_message(sync_key, peer_id, data_bytes)
        except Exception as e:
            print(f"[P2PT] Error handling peer message: {e}")

    async def _handle_data_channel(
        self, sync_key: str, peer_id: str, channel: RTCDataChannel
    ) -> None:
        """Handle established data channel."""
        if self._destroyed:
            channel.close()
            return

        data = self._sync_key_data.get(sync_key)
        if not data:
            return

        print(f"[P2PT] Data channel opened with {peer_id[:8]}...")

        # Check if peer already exists
        if peer_id in data.peers:
            print(f"[P2PT] Peer already exists: {peer_id[:8]}...")
            return

        # Create peer connection state
        conn = PeerConnection(peer_id=peer_id, data_channel=channel)

        @channel.on("message")
        def on_message(message: bytes):
            asyncio.create_task(self._handle_message(sync_key, peer_id, message))

        @channel.on("close")
        def on_close():
            self._handle_peer_close(sync_key, peer_id)

        data.peers[peer_id] = conn
        data.peer_id_to_sync_key[peer_id] = sync_key

        # Set validation timeout
        async def validation_timeout():
            await asyncio.sleep(PEER_VALIDATION_TIMEOUT / 1000)
            if not conn.validated:
                print(f"[P2PT] Peer validation timeout: {peer_id[:8]}...")
                self._remove_peer(sync_key, peer_id)

        conn.validation_timer = asyncio.create_task(validation_timeout())

        # Send authentication challenge
        await self._send_challenge(sync_key, peer_id)

        self._notify_status_change()

    def _handle_peer_close(self, sync_key: str, peer_id: str) -> None:
        """Handle peer disconnection."""
        print(f"[P2PT] Peer disconnected from {sync_key[:8]}...: {peer_id[:8]}...")
        self._remove_peer(sync_key, peer_id)

    def _remove_peer(self, sync_key: str, peer_id: str) -> None:
        """Remove a peer and clean up."""
        data = self._sync_key_data.get(sync_key)
        if not data:
            return

        conn = data.peers.pop(peer_id, None)
        if conn:
            if conn.validation_timer:
                conn.validation_timer.cancel()

            if conn.data_channel and conn.data_channel.readyState == "open":
                conn.data_channel.close()

            data.peer_id_to_sync_key.pop(peer_id, None)
            self._notify_status_change()

    async def _handle_message(
        self, sync_key: str, peer_id: str, message: bytes
    ) -> None:
        """Handle incoming message."""
        if self._destroyed:
            return

        data = self._sync_key_data.get(sync_key)
        if not data:
            return

        conn = data.peers.get(peer_id)
        if not conn:
            print(f"[P2PT] Message from unknown peer: {peer_id[:8]}...")
            return

        # Parse the message
        parsed = parse_message(message)
        if not parsed:
            print("[P2PT] Failed to parse message")
            return

        type_code, payload = parsed

        # Queue message if peer not validated (unless it's a challenge response)
        if not conn.validated and type_code not in (MSG_CHALLENGE_RESP, MSG_CHALLENGE):
            conn.queued_messages.append(message)
            return

        # Process the message
        await self._process_message(sync_key, peer_id, type_code, payload)

    async def _process_message(
        self, sync_key: str, peer_id: str, type_code: int, payload: bytes
    ) -> None:
        """Process a validated message."""
        data = self._sync_key_data.get(sync_key)
        if not data:
            return

        conn = data.peers.get(peer_id)
        if not conn:
            return

        if type_code == MSG_CHALLENGE:
            await self._handle_challenge(sync_key, peer_id, payload)
        elif type_code == MSG_CHALLENGE_RESP:
            await self._handle_challenge_response(sync_key, peer_id, payload)
        elif type_code == MSG_STATE_VECTOR:
            await self._handle_state_vector(sync_key, peer_id, payload)
        elif type_code == MSG_STATE_UPDATE:
            await self._handle_state_update(sync_key, peer_id, payload)
        elif type_code == MSG_DOC_UPDATE:
            self._handle_doc_update(sync_key, peer_id, payload)
        elif type_code == MSG_AWARENESS_UPDATE:
            self._handle_awareness_update(sync_key, peer_id, payload)
        else:
            print(f"[P2PT] Unknown message type: {type_code}")

    async def _send_challenge(self, sync_key: str, peer_id: str) -> None:
        """Send authentication challenge to peer."""
        data = self._sync_key_data.get(sync_key)
        if not data:
            return

        conn = data.peers.get(peer_id)
        if not conn or not conn.data_channel:
            return

        # Generate random challenge
        challenge = secrets.token_bytes(32)
        conn.challenge = bytes_to_hex(challenge)

        # Send challenge
        msg = create_message(MSG_CHALLENGE, challenge)
        conn.data_channel.send(base64.b64encode(msg).decode())

    async def _handle_challenge(
        self, sync_key: str, peer_id: str, payload: bytes
    ) -> None:
        """Handle incoming challenge - respond with HMAC."""
        data = self._sync_key_data.get(sync_key)
        if not data:
            return

        conn = data.peers.get(peer_id)
        if not conn or not conn.data_channel:
            return

        if len(payload) < 32:
            print("[P2PT] Challenge payload too short")
            return

        challenge_hex = bytes_to_hex(payload[:32])

        # Compute HMAC response
        sync_key_bytes = data.sync_key.encode()
        challenge_bytes = hex_to_bytes(challenge_hex)
        response = hmac_sha256(sync_key_bytes, challenge_bytes)

        msg = create_message(MSG_CHALLENGE_RESP, response)
        conn.data_channel.send(base64.b64encode(msg).decode())

    async def _handle_challenge_response(
        self, sync_key: str, peer_id: str, payload: bytes
    ) -> None:
        """Handle challenge response - validate and complete handshake."""
        data = self._sync_key_data.get(sync_key)
        if not data:
            return

        conn = data.peers.get(peer_id)
        if not conn:
            return

        if len(payload) < 32:
            print("[P2PT] Challenge response payload too short")
            return

        response = payload[:32]

        # Verify HMAC
        sync_key_bytes = data.sync_key.encode()
        challenge_bytes = hex_to_bytes(conn.challenge or "")

        if not challenge_bytes:
            print("[P2PT] No stored challenge")
            return

        expected_response = hmac_sha256(sync_key_bytes, challenge_bytes)

        # Compare responses
        if response == expected_response:
            print(f"[P2PT] Peer validated: {peer_id[:8]}...")
            conn.validated = True

            # Cancel validation timeout
            if conn.validation_timer:
                conn.validation_timer.cancel()

            # Process queued messages
            for msg in conn.queued_messages:
                parsed = parse_message(msg)
                if parsed:
                    await self._process_message(sync_key, peer_id, *parsed)
            conn.queued_messages.clear()

            # Send our state vector
            await self._send_state_vector(sync_key, peer_id)
        else:
            print(f"[P2PT] Invalid challenge response from: {peer_id[:8]}...")
            self._remove_peer(sync_key, peer_id)

    async def _send_state_vector(self, sync_key: str, peer_id: str) -> None:
        """Send our state vector to a peer."""
        data = self._sync_key_data.get(sync_key)
        if not data:
            return

        conn = data.peers.get(peer_id)
        if not conn or not conn.data_channel:
            return

        state_vector = encode_state_vector(self.ydoc)
        msg = create_message(MSG_STATE_VECTOR, state_vector)
        conn.data_channel.send(base64.b64encode(msg).decode())

    async def _handle_state_vector(
        self, sync_key: str, peer_id: str, payload: bytes
    ) -> None:
        """Handle incoming state vector - send our state."""
        data = self._sync_key_data.get(sync_key)
        if not data:
            return

        conn = data.peers.get(peer_id)
        if not conn or not conn.data_channel:
            return

        # Encode our state as update based on their state vector
        state_update = encode_state_as_update(self.ydoc, payload)
        msg = create_message(MSG_STATE_UPDATE, state_update)
        conn.data_channel.send(base64.b64encode(msg).decode())

    async def _handle_state_update(
        self, sync_key: str, peer_id: str, payload: bytes
    ) -> None:
        """Handle incoming state update - apply to document."""
        apply_update(self.ydoc, payload, peer_id)

    def _handle_doc_update(
        self, sync_key: str, peer_id: str, payload: bytes
    ) -> None:
        """Handle document update from peers."""
        apply_update(self.ydoc, payload, peer_id)

    def _handle_awareness_update(
        self, sync_key: str, peer_id: str, payload: bytes
    ) -> None:
        """Handle awareness update from peer."""
        try:
            update = json.loads(payload.decode())
            print(f"[P2PT] Awareness update from {peer_id[:8]}: {update}")
        except Exception as e:
            print(f"[P2PT] Failed to parse awareness update: {e}")

    def _broadcast_awareness_update(self) -> None:
        """Broadcast awareness update to all validated peers."""
        local_state = self.get_awareness()
        if not local_state:
            return

        payload = json.dumps({"user": local_state.get("user", {})}).encode()
        msg = create_message(MSG_AWARENESS_UPDATE, payload)

        for data in self._sync_key_data.values():
            for conn in data.peers.values():
                if conn.validated and conn.data_channel:
                    if conn.data_channel.readyState == "open":
                        try:
                            conn.data_channel.send(base64.b64encode(msg).decode())
                        except Exception as e:
                            print(f"[P2PT] Failed to send awareness update: {e}")

    def _handle_doc_change(self, event: Any) -> None:
        """Handle document updates from pycrdt."""
        update_data = json.dumps(dict(self.ydoc._data)).encode()
        msg = create_message(MSG_DOC_UPDATE, update_data)

        for data in self._sync_key_data.values():
            for peer_id, conn in data.peers.items():
                if not conn.validated or not conn.data_channel:
                    continue

                if conn.data_channel.readyState == "open":
                    try:
                        conn.data_channel.send(base64.b64encode(msg).decode())
                    except Exception as e:
                        print(f"[P2PT] Failed to send update to {peer_id[:8]}: {e}")

    def _notify_status_change(self) -> None:
        """Notify status change callback."""
        total_peers = sum(
            len([c for c in data.peers.values() if c.validated])
            for data in self._sync_key_data.values()
        )

        status = {
            "connected": not self._destroyed and len(self._sync_key_data) > 0,
            "peers": total_peers,
            "sync_keys": list(self._sync_key_data.keys()),
            "trackers": self._tracker.connected_trackers,
        }

        if self.on_status_change:
            self.on_status_change(status)

    def get_awareness(self) -> Dict[str, Any]:
        """Get the awareness state."""
        return self._awareness_state

    def set_awareness(self, state: Dict[str, Any]) -> None:
        """Set the local awareness state."""
        self._awareness_state = state
        self._broadcast_awareness_update()

    def get_status(self) -> Dict[str, Any]:
        """Get current connection status."""
        total_peers = sum(
            len([c for c in data.peers.values() if c.validated])
            for data in self._sync_key_data.values()
        )
        return {
            "connected": not self._destroyed and len(self._sync_key_data) > 0,
            "peers": total_peers,
            "sync_keys": list(self._sync_key_data.keys()),
            "trackers": self._tracker.connected_trackers,
        }

    def is_connected_to(self, sync_key: str) -> bool:
        """Check if connected to a specific sync key."""
        return sync_key in self._sync_key_data and not self._destroyed

    async def destroy(self) -> None:
        """Destroy the provider and disconnect."""
        if self._destroyed:
            return
        self._destroyed = True

        # Remove doc observer
        if hasattr(self.ydoc, 'unobserve') and self._doc_observer:
            try:
                self.ydoc.unobserve(self._doc_observer)
            except Exception:
                pass

        # Clean up peers
        for data in self._sync_key_data.values():
            for conn in data.peers.values():
                if conn.validation_timer:
                    conn.validation_timer.cancel()
                if conn.data_channel and conn.data_channel.readyState == "open":
                    conn.data_channel.close()
            data.peers.clear()

        # Unsubscribe from trackers
        for data in self._sync_key_data.values():
            self._tracker.unsubscribe(data.info_hash, data.subscriber_id)

        self._sync_key_data.clear()

        # Stop tracker manager
        await self._tracker.stop()

        self._notify_status_change()
        print("[P2PT] Destroyed")


def generate_sync_key() -> str:
    """Generate a random sync key."""
    return secrets.token_hex(16)