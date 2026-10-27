/* Resolve responsive reading views and keep logical page anchors across layouts. */
(() => {
  const validPreference=value=>['auto','single','spread'].includes(value)?value:'auto';
  function preference(state){
    if(['auto','single','spread'].includes(state?.viewPreference))return state.viewPreference;
    // Older spread settings were also the default. Let those adapt on phones.
    return state?.pdfView==='single'?'single':'auto';
  }
  function resolve(value,width,coarse=false){
    const choice=validPreference(value);
    return choice==='auto'?(width<=700||(coarse&&width<=1000)?'single':'spread'):choice;
  }
  function anchor(position,total,pageCount,single){
    if(position<=0)return {edge:'cover'};
    if(position>=total)return {edge:'end'};
    return {page:single?position:position*2-1,pageCount};
  }
  function position(saved,pageCount,total,single){
    if(saved?.edge==='cover')return 0;
    if(saved?.edge==='end')return total;
    if(!Number.isFinite(saved?.page)||!Number.isFinite(saved?.pageCount)||saved.pageCount<=0)return null;
    const page=Math.max(1,Math.min(pageCount,Math.round((saved.page-1)*pageCount/saved.pageCount)+1));
    return single?page:Math.floor((page-1)/2)+1;
  }
  function restore(state,pageCount,total,single){
    const anchored=position(state?.readingAnchor,pageCount,total,single);
    if(anchored!==null)return anchored;
    if(!state||!Number.isFinite(state.position)||!Number.isFinite(state.total)||state.total<=0)return 0;
    const wasSingle=state.readingView==='single'||state.pdfView==='single';
    const pages=state.pageCount??Math.max(1,wasSingle?state.total-1:(state.total-1)*2);
    return position(anchor(state.position,state.total,pages,wasSingle),pageCount,total,single)??0;
  }
  const api={validPreference,preference,resolve,anchor,position,restore};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else window.ReadingLayout=api;
})();
