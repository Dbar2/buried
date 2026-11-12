// The Player-to-Shell half of the bridge. The Shell defines window.buriedBridge.onMessage before
// the Player starts (web/src/bridge/bridge.ts). Nothing else in the Player calls into JavaScript.
mergeInto(LibraryManager.library, {
  BuriedBridge_Send: function (ptr) {
    var json = UTF8ToString(ptr);
    if (
      typeof window !== 'undefined' &&
      window.buriedBridge &&
      typeof window.buriedBridge.onMessage === 'function'
    ) {
      window.buriedBridge.onMessage(json);
    } else {
      console.error('Buried bridge: window.buriedBridge.onMessage is not defined; message dropped.');
    }
  },
});
