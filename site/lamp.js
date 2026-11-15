// Set the lamp before anything is drawn, so that a dark room stays dark.
// Loaded in the head of every page, ahead of the stylesheet's first use.
(function () {
  var lamp;
  try {
    lamp = JSON.parse(localStorage.getItem('receiver') || '{}').lamp;
  } catch (e) {
    // No storage. Go by the room.
  }
  if (typeof lamp !== 'boolean') lamp = !(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.lamp = lamp ? 'on' : 'off';
})();
