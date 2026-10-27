// A slow IndexedDB read must not overwrite the section selected in the dialog.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
function element(){return {children:[],attributes:{},textContent:'',append(...nodes){this.children.push(...nodes);},replaceChildren(...nodes){this.children=nodes;},setAttribute(key,value){this.attributes[key]=value;}};}
const elements=new Map();const document={querySelector(selector){if(!elements.has(selector))elements.set(selector,element());return elements.get(selector);},createElement:element};
const panel=document.querySelector('#saved-panel');let opens=0;panel.showModal=()=>{assert.ok(!panel.open);panel.open=true;opens++;};
const sandbox={document};vm.runInNewContext(html.slice(html.indexOf('class BookReader {'),html.indexOf('document.fonts.ready'))+'\nthis.Reader=BookReader;',sandbox);
(async()=>{
 const reader=Object.create(sandbox.Reader.prototype);reader.clearCornerPreview=()=>{};reader.bookmarks=[];reader.title='A test book';
 let resolve;reader.storage={list:()=>new Promise(done=>resolve=done)};
 const pending=reader.showSaved('library');await reader.showSaved('bookmarks');
 const list=document.querySelector('#saved-list'),bookmarkEmpty=list.children[0];
 resolve([{id:'old-result',title:'A slow result'}]);await pending;
 assert.equal(opens,1,'Switching sections keeps the existing dialog open');assert.equal(list.children[0],bookmarkEmpty,'A late library result must not overwrite bookmarks');
 assert.equal(document.querySelector('#saved-tab-bookmarks').attributes['aria-pressed'],true);
 const closing=reader.showSaved('library');panel.open=false;const closingContent=list.children[0];resolve([]);await closing;
 assert.equal(list.children[0],closingContent,'Closing the dialog ignores late storage results');
 console.log('Library controls checks passed: section switching, one dialog and stale reads after switch/close.');
})().catch(error=>{console.error(error);process.exitCode=1;});
