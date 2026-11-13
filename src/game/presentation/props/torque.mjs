// Torque Auto's furniture families (ta_*): the service bay's tool chests, bench and tyres, the parts
// room's shelving, the showroom's steel counter and cognac leather. Amber is the house colour. Drawn on
// the art toolkit as the other venues' are. (The two lifts, the wrap bay and the plinth carry cars, so
// they wait for the vehicles' own art.)
import {rect,circle,linear,radial} from '../../../engine/basement/rendering/index.mjs';
import {box,disc,lines} from './draw.mjs';

const TAU=Math.PI*2,STEEL_HI='#dfe3ea',STEEL='#9aa3ad',STEEL_LO='#4a5059',AMBER='#ff9a2a',RUBBER='#141416';
/** Brushed steel along (x0, y0) to (x1, y1). */
const steel=(x0,y0,x1,y1)=>linear([x0,y0],[x1,y1],[[0,'#6c747e'],[.45,STEEL_HI],[.55,'#a9b1ba'],[1,'#565d66']]);
/** The drop shadow under each piece, 2 right and 3 down. */
const drop=(s,w,h,r,dx=2,dy=3,a=.35)=>box(s,dx,dy,w,h,r,`rgba(0,0,0,${a})`);

export const TORQUE_ARTISTS={
    tool_chest:{pad:10,draw(art,piece,look){art.still(s=>{              // a rolling tool chest: lacquer, drawer pulls, a tray of spanners on top
        const {width:w,height:h}=piece;
        drop(s,w,h,3);
        box(s,0,0,w,h,3,linear([0,-h/2],[0,h/2],[[0,look.lacquer_light],[1,look.lacquer_dark]]),look.edge,1);
        box(s,3,3,w-6,h*.42,2,'#1a1a1e','#5a5a62',.8);
        const spanners=[];for(let i=0;i<6;i++){const sx=7+i*(w-14)/6;spanners.push([sx,6,sx+3,h*.4-2]);}lines(s,spanners,STEEL_HI,1);
        s.fill([0,1,2].flatMap(i=>rect(6,h*.55+i*h*.14,w-12,1.2)),'rgba(255,255,255,.55)');
    });}},
    garage_workbench:{pad:10,draw(art,piece,look){art.still(s=>{               // butcher block, the pegboard behind, a vise and a lamp
        const {width:w,height:h}=piece;
        drop(s,w,h,2);
        box(s,0,0,w,h*.34,1,'#2c2f35','#4d525a');
        const holes=[];for(let px=5;px<w-3;px+=6)for(let py=3;py<h*.32;py+=5)holes.push(...rect(px,py,1,1));s.fill(holes,'rgba(223,227,234,.25)');
        for(const [tx,tl] of [[20,8],[34,10],[48,7],[w-40,9]])s.stroke([['move',tx,2],['line',tx,2+tl]],STEEL_HI,1.4);
        box(s,0,h*.34,w,h*.66,2,linear([0,-h*.34-h*.33],[0,h*.66-h*.33],[[0,look.wood_light],[1,look.wood]]),'#3a2412',1);
        const grain=[];for(let px=8;px<w;px+=8)grain.push([px,h*.34,px,h]);lines(s,grain,'rgba(40,20,8,.35)',.7);
        box(s,w-28,h*.42,20,12,2,'#3c414a',STEEL,.8);s.fill(rect(w-32,h*.5,28,1.6),STEEL_HI);
        box(s,14,h*.5,24,9,2,'#1c1c20',AMBER,.8);
    });}},
    air_compressor:{pad:10,draw(art,piece,look){art.still(s=>{          // the tank, the motor and a coiled hose
        const {width:w,height:h}=piece;
        drop(s,w,h,8);
        box(s,0,h*.25,w,h*.6,h*.3,steel(0,-h*.25-h*.3,0,h-h*.25-h*.3),'#3d434b',1);
        box(s,w*.2,2,w*.5,h*.32,3,'#1e2024','#4d525a',1);
        for(let i=0;i<3;i++)s.stroke([circle(w*.78,h*.5,4+i*2.2)],look.hose,1.6);
    });}},
    tyre_stack:{pad:10,draw(art,piece,look){art.still(s=>{              // a stack of tyres: the top one's tread and rim
        const {width:w,height:h}=piece,cx=w/2,cy=h/2,r=Math.min(w,h)/2;
        disc(s,cx+3,cy+4,r,'rgba(0,0,0,.4)');disc(s,cx,cy,r,RUBBER);
        for(let i=0;i<24;i++){const a=i/24*TAU;s.stroke([['move',cx+Math.cos(a)*r*.78,cy+Math.sin(a)*r*.78],['line',cx+Math.cos(a)*r*.98,cy+Math.sin(a)*r*.98]],'#2c2c30',1);}
        disc(s,cx,cy,r*.55,'#0a0a0c');s.stroke([circle(cx,cy,r*.42)],look.rim,1.2);
        disc(s,cx-r*.3,cy-r*.3,r*.35,'rgba(255,255,255,.08)');
    });}},
    tyre_rack:{pad:10,draw(art,piece,look){art.still(s=>{               // a wall rack, tyres stood on edge
        const {width:w,height:h}=piece,n=Math.floor(h/15);
        drop(s,w,h,2);box(s,0,0,w,h,2,'#2a2d33',STEEL_LO,1);
        for(let i=0;i<n;i++){const ty=4+i*(h-8)/n;box(s,3,ty,w-6,(h-8)/n-2,3,RUBBER,'#36363c',.8);s.fill(rect(5,ty+(h-8)/n/2-1.5,w-10,1),'#3a3a40');}
    });}},
    oil_drum:{pad:10,draw(art,piece,look){art.still(s=>{                // an oil drum: the ribbed lid, the brand's band
        const {width:w,height:h}=piece,cx=w/2,cy=h/2,r=w/2;
        disc(s,cx+2,cy+3,r,'rgba(0,0,0,.4)');disc(s,cx,cy,r,look.paint);
        s.stroke([circle(cx,cy,r*.75)],'rgba(255,255,255,.25)',1);disc(s,cx+r*.4,cy-r*.2,2,STEEL);
    });}},
    service_counter:{pad:10,draw(art,piece,look){art.still(s=>{         // brushed steel, an amber light line, the till, the bell, brochures
        const {width:w,height:h}=piece;
        drop(s,w,h,6,3,4,.4);
        box(s,0,0,w,h,6,steel(0,-h/2,0,h/2),'#3a3f46',1);
        box(s,4,4,w-8,h-12,4,'#16161a','#5d636c',.8);
        s.fill(rect(6,h-6,w-12,2),AMBER);
        box(s,18,8,30,18,2,'#0d0d10',STEEL,.8);s.fill(rect(21,11,24,7),'#58d0ff');
        disc(s,w-26,16,5,STEEL_HI);disc(s,w-26,16,1.6,'#2b2b30');
        ['#e9e4dc','#ffcf8a','#c9c2ff'].forEach((c,i)=>box(s,60+i*20,9,15,11,1,c));
        s.text(look.sign,w-66,16,{font:{family:'Orbitron, monospace',size:7},align:'center',baseline:'middle'},{fill:'rgba(255,196,106,.75)'});
    });}},
    rim_wall:{pad:10,draw(art,piece,look){art.still(s=>{                // alloys hung in a row
        const {width:w,height:h}=piece,n=Math.floor(w/30);
        drop(s,w,h,3);box(s,0,0,w,h,3,'#1b1b20','#4b5059',1);
        for(let i=0;i<n;i++){
            const cx=15+i*(w-30)/Math.max(1,n-1),cy=h/2,r=h/2-3;
            disc(s,cx,cy,r,RUBBER);disc(s,cx,cy,r*.72,look.rims[i%look.rims.length]);
            const spokes=[];for(let k=0;k<5;k++){const a=k/5*TAU+i;spokes.push(['move',cx,cy],['line',cx+Math.cos(a)*r*.7,cy+Math.sin(a)*r*.7]);}s.stroke(spokes,'rgba(0,0,0,.55)',1.2);
            disc(s,cx,cy,1.6,STEEL_HI);
        }
    });}},
    lounge_chair:{pad:10,draw(art,piece,look){art.still(s=>{            // cognac leather on a chrome frame, its back away from its face
        const {width:w,height:h}=piece,f=piece.face==='W'?-1:1;
        drop(s,w,h,8);
        box(s,0,0,w,h,8,look.leather,'#2e180a',1);
        box(s,f>0?0:w-10,2,10,h-4,5,look.back);
        box(s,4,4,w-8,h-8,6,null,'rgba(255,214,160,.25)',.8);
        s.stroke([['move',3,h-1],['line',w-3,h-1]],STEEL_HI,1);
    });}},
    glass_side_table:{pad:10,draw(art,piece,look){art.still(s=>{        // a glass side table: a magazine and a Bellafore
        const {width:w,height:h}=piece;
        disc(s,w/2+2,h/2+3,w/2,'rgba(0,0,0,.3)');
        disc(s,w/2,h/2,w/2,'rgba(190,210,230,.25)',STEEL_HI,1);
        s.enter({position:[w/2,h/2],rotation:.3});box(s,-8,-6,12,9,1,look.magazine);s.leave();
        disc(s,w/2+5,h/2+3,2.4,'#ffcf8a');
    });}},
    parts_shelving:{pad:10,draw(art,piece,look){art.still(s=>{          // steel uprights, labelled boxes of every size
        const {width:w,height:h}=piece,[x0,y0]=piece.seed;
        drop(s,w,h,2);box(s,0,0,w,h,2,'#2b2e34',STEEL_LO,1);
        let bx=4,i=0;
        while(bx<w-10){
            const bw=14+(((x0+bx)*7+y0)%13);                            // each box's width, as the classic art drew it from where it stood
            if(bx+bw>w-4)break;
            box(s,bx,4,bw,h-8,1,look.boxes[i++%look.boxes.length],'rgba(0,0,0,.4)',.6);
            s.fill(rect(bx+3,h/2-1.5,bw-6,3),'rgba(255,255,255,.7)');
            bx+=bw+3;
        }
        s.fill(rect(0,h-2,w,2),AMBER);
    });}},
    waiting_sofa:{pad:10,draw(art,piece,look){art.still(s=>{            // the waiting sofa by the door
        const {width:w,height:h}=piece;
        drop(s,w,h,9);
        box(s,0,0,w,h,9,look.leather,'#2e180a',1);box(s,0,h-12,w,12,6,look.base);
        for(let i=0;i<3;i++)box(s,6+i*(w-12)/3,5,(w-12)/3-3,h-19,5,look.cushion,'rgba(255,214,160,.3)',.8);
    });}}
};
