/** Studio / view preferences. Never serialized into authored game projects or history. */
export class StudioPreferences {
 constructor(){this.key='ETRNLNINE.Studio.view.v1';this.value={grid:false,lights:true,axes:false,outlines:false,axis:'z',space:'world',angleSnap:15};try{const v=JSON.parse(localStorage.getItem(this.key));if(v){for(const key of ['grid','lights','axes','outlines'])if(typeof v[key]==='boolean')this.value[key]=v[key];if(['x','y','z'].includes(v.axis))this.value.axis=v.axis;if(['world','local'].includes(v.space))this.value.space=v.space;if([0,5,15,45].includes(v.angleSnap))this.value.angleSnap=v.angleSnap;}}catch{/* Storage is optional; defaults remain useful offline. */}}
 /** Only fixed known settings are accepted; unavailable storage never blocks tool use. */
 set(key,value){this.value[key]=value;try{localStorage.setItem(this.key,JSON.stringify(this.value));}catch{/* Best effort, like other browser preferences. */}}
}
