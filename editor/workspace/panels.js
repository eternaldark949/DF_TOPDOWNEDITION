/** Studio / contextual panels. One inspector and asset browser serve every placed asset. */
import { TRANSFORM_PROPERTIES, LIGHT_PROPERTIES } from '../../engine/basement/properties.js';
import { PropertyInspector } from '../../engine/penthouse/property-inspector.js';
export class WorkspacePanels {
 /** Element references and callbacks are supplied by the application shell. */
 constructor(elements,{onSelect,onPlace,onError}){this.elements=elements;this.onSelect=onSelect;this.onPlace=onPlace;this.onError=onError;this.inspector=null;this.refreshing=false;this.filter='';}
 /** Commit/cancel/context changes rebuild controls, never a high-rate pointer preview. */
 refresh(session){
  if(this.refreshing)return;this.refreshing=true;
  try{
   this.inspector?.dispose();this.inspector=null;
   const e=this.elements,scene=session.scene,doc=session.document;
   e.fields.replaceChildren();e.hierarchy.replaceChildren();
   e.scene.replaceChildren(...doc.data.scenes.map((scene,i)=>{const option=document.createElement('option');option.value=i;option.textContent=scene.name;return option;}));e.scene.value=session.sceneIndex;
   const light=scene.lights.find(l=>l.id===session.selected),entity=scene.entities.find(e=>e.id===session.selected),target=light??entity;
   e.name.textContent=light?'Point light '+(scene.lights.indexOf(light)+1):entity?.name??'Select an instance';e.id.textContent=target?.id??'';
   for(const item of [...scene.entities.filter(e=>!e.locked),...scene.lights]){
    const button=document.createElement('button');button.textContent=item.name??'◈ Point light '+(scene.lights.indexOf(item)+1);button.dataset.id=item.id;button.dataset.light=String(!item.name);button.setAttribute('aria-pressed',String(item.id===session.selected));button.addEventListener('click',()=>this.onSelect(item.id));e.hierarchy.append(button);
   }
   if(target&&!entity?.locked&&!session.play){
    const id=target.id,index=session.sceneIndex,resolve=data=>(light?data.scenes[index].lights:data.scenes[index].entities).find(e=>e.id===id);
    this.inspector=new PropertyInspector({host:e.fields,document:doc,resolve,properties:light?LIGHT_PROPERTIES:TRANSFORM_PROPERTIES,onError:this.onError});
   }
   if(session.preview)for(const [id,item]of session.preview.instance.instances)for(const part of item.parts)part.highlight=id===session.selected?1:0;
   this.renderAssets(session);
  }finally{this.refreshing=false;}
 }
 /** All packaged assets can be placed; source identity disambiguates similar palettes. */
 renderAssets(session){
  const host=this.elements.assets;host.replaceChildren();
  const query=this.filter.trim().toLowerCase();
  for(const asset of session.document.data.assets.filter(a=>(a.name+' '+a.id).toLowerCase().includes(query))){
   const button=document.createElement('button');button.className='asset-card';button.dataset.asset=asset.id;button.setAttribute('aria-label','Place '+asset.name);button.disabled=!!session.play;
   const swatch=document.createElement('span');swatch.className='asset-swatch';const color=asset.parts.find(p=>p.shape)?.shape.color??[.6,.4,.2];swatch.style.background=`rgb(${color.map(n=>Math.round(255*Math.min(1,n**(1/2.2)))).join(',')})`;
   const label=document.createElement('span'),name=document.createElement('strong'),detail=document.createElement('small');name.textContent=asset.name;detail.textContent=asset.id;label.append(name,detail);button.append(swatch,label);button.addEventListener('click',()=>this.onPlace(asset.id));host.append(button);
  }
 }
 /** Cancelled properties cannot spawn replacement controls during application disposal. */
 dispose(){this.inspector?.dispose();this.inspector=null;}
}
