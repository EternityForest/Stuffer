# Stuffer

Demo: https://eternityforest.github.io/Stuffer/index.html

Create objects, add contents to those objects,
scan QR codes to quickly add and remove.

### Items

Items are unique tagged things.  They can have other items as contents.  An item can only be in one place.

### Amounts

If an item is a bulk container, you can add amount updates
for when quantity is added or removed.  Unit conversion supported.  Every addition, removal, or recount is logged,
and logs are editable.

### Loadouts

Loadouts are reusable packing lists. Any box can
have a selected loadout, if the real contents don't match, it displays a warning.


### Sync

Everything is stored in the local browser storage,
but there is a sync feature.

On both devices, go to workspace settings and create a local peer key.  Keep this secret.

On your "client" devices, enter the peer key of the server as the "sync with remote peer" option.

Connect the "server" first with the reconnect button,
then connect the clients.

Everything syncs p2p with WebRTC via peer.js.  Due to
the signalling server, it requires internet.

