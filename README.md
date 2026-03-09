# Stuffer

Live app: https://eternityforest.github.io/Stuffer/index.html

Create objects, add contents to those objects,
scan QR codes to quickly add and remove.

There is no backend, the entire app runs in the browser.


### Items

Items are unique tagged things.  They can have other items as contents.  An item can only be in one place.

### Aliases

On the aliases manager screen, you can assign more than one QR code to an item.

### Categories

In the workspace settings, you can create any number of categories. Items can be added to any number of categories.


### Amounts

If an item is a bulk container, you can add amount updates
for when quantity is added or removed.  Unit conversion supported.  Every addition, removal, or recount is logged,
and logs are editable.

### Loadouts

Loadouts are reusable packing lists. Any box can
have a selected loadout, if the real contents don't match, it displays a warning.

### Reinventory

Items in the contents section display the time they were last scanned into a container. Re-add them again to update the date and show that they
have been recently inspected.

Every container has a reinventory date.  If you
select "recheck inventory", all contents
that have not been re-added since that date will show a warning.

You can use this to recheck the contents of a box before leaving a site.

### Sync

Everything is stored in the local browser storage,
but there is a sync feature.


### Manual file sync

From the workspaces page, you can export the complete state of
the workspace(Excluding local settings like sync keys),
and import it into another workspace to merge all the changes.

YJS CRDTs should make this work as you expect if you have a bunch of people reporting files to a central location.


### Peer.js live sync

There's live sync, but the "server" is a browser tab and you
currently have to manually connect.


On both devices, go to workspace settings and create a local peer key.  Keep this secret.

On your "client" devices, enter the peer key of the server as the "sync with remote peer" option.

Connect the "server" first with the reconnect button,
then connect the clients.

Everything syncs p2p with WebRTC via peer.js.  Due to
the signalling server, it requires internet.

