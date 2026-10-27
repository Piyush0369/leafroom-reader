/* Pure gesture geometry shared by pointer pinches and trackpad zoom. */
(() => {
  const clampZoom = value => Math.min(3, Math.max(1, value));
  function measure(points) {
    const [a,b] = points;
    return {distance:Math.max(1,Math.hypot(b.x-a.x,b.y-a.y)),x:(a.x+b.x)/2,y:(a.y+b.y)/2};
  }
  function pinch(start, current) {
    const zoom=clampZoom(start.zoom*current.distance/start.distance);
    const ratio=zoom/start.zoom;
    return {zoom,pan:{x:current.x+(start.pan.x-start.x)*ratio,y:current.y+(start.pan.y-start.y)*ratio}};
  }
  const api={clampZoom,measure,pinch};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else window.ViewGestures=api;
})();
