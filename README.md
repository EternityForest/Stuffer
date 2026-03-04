Let's create a prototype of an inventory app!  This will be for individuals and small
teams to track their stuff.

Features:

* Runs entirely in the browser as a static site.  No server or backend.
* Powered by Lit.js, use CSS classes from ./src/styles/barrel.css
* Use YJS to store data, sync using webrtc
* Works offline, use a web worker
* Objects are tracked in the database
* Objects can "contain" or "be with" other objects to add contents.
* List all objects screen
* Object properties screen has "add contents" and "remove contents"
* When you're on "add contents" you just scan an items QR to add it as a content
* Recheck inventory button lets you rescan the complete contents of a box
* Can save the contents of a box as a "loadout"
* App tells you if the current contents don't match the loadout


## Screens

Workspace Selector:
    Create workspace with secret sync key and name

Workspace Browser:
    Search Bar
    Workspace Settings
    Loadouts list link
    Scan QR Button
    [List of objects as preview cards]

Object Inspect:
    Title
    Image
    Notes
    Select Loadout
    Save as loadout
    Add Contents
    Remove Contents

List Browser(Use for contents and loadout):
    Add Item
    Delete Item
    [List of items]:  Delete button

Add/Remove item screen:
    Text box
    QR scan preview

## Data Structures

Workspaces:
    [name]: Workspace

Workspace:
    WorkspaceSyncRoomKey
    Objects:
      [UUID]: Object
    Loadouts:
        [UUID]: Loadout

Object:
    title
    UUID
    description
    contents:
        ContentRecord
    selectedLoadout: None:UUID
    lastScanTime
    lastScanLocation
    Log: Array[LogEntry]
    container: UUID of the container it's currently in.

LogEntry:
    text
    time
    author


Loadout:
    title
    UUID
    description
    contents:
        ContentRecord


ContentRecord:
    ItemUUID
    amount
