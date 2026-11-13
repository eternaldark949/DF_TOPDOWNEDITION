// The House of Death's furniture families (the gauntlet's mansion: black marble, oxblood wood, gold,
// violet glass, cyan holograms), drawn on the art toolkit as the cafe's and the apartment's are. Its
// candles burn live: each flame breathes on its own beat, keyed to where it stands, as the classic did.
import {rect,circle,ellipse,polygon} from '../../../engine/basement/rendering/index.mjs';
import {box,disc,lines} from './draw.mjs';

const TAU=Math.PI*2;
const rects=list=>list.flatMap(([x,y,w,h])=>rect(x,y,w,h));
/** A candle's wax (still) at (fx, fy), `s` times its size. */
const wax=(s,fx,fy,size,color)=>disc(s,fx,fy,2.2*size,color);
/** Its flame (live), breathing on a beat keyed to the world x it stands at and its number `k`. */
function flame(s,piece,fx,fy,size=1,k=0){
    const f=.75+.25*Math.sin(piece.time*11+(piece.seed[0]+fx)*.3+k);
    disc(s,fx,fy-.5,1.6*size*f,`rgba(255,${190+40*f|0},110,0.95)`);
}

export const HOUSE_ARTISTS={
    gothic_candelabra:{draw(art,piece,look){                             // wrought iron, five candles
        const {width:w,height:h}=piece,cx=w/2,cy=h/2;
        const candles=[[cx,cy,1.1,0],[cx-w/2+3,cy,.9,1],[cx+w/2-3,cy,.9,2],[cx,cy-h/2+3,.9,3],[cx,cy+h/2-3,.9,4]];
        art.still(s=>{
            disc(s,cx,cy,w/2-1,null,look.iron,1.4);
            lines(s,[[cx-w/2+3,cy,cx+w/2-3,cy],[cx,cy-h/2+3,cx,cy+h/2-3]],look.iron,1.2);
            for(const [fx,fy,size] of candles)wax(s,fx,fy,size,look.wax);
        });
        art.live(s=>{for(const [fx,fy,size,k] of candles)flame(s,piece,fx,fy,size,k);});
    }},
    oxblood_table:{draw(art,piece,look){                                 // gold inlay; a runner and candles when laid, else books and an astrolabe
        const {width:w,height:h}=piece;
        art.still(s=>{
            box(s,0,0,w,h,5,look.wood,look.wood_edge,1.2);
            box(s,4,4,w-8,h-8,3,null,'rgba(201,164,106,0.45)',.8);
            if(piece.candles){
                box(s,12,h/2-8,w-24,16,2,look.runner);
                s.fill(rects([[12,h/2-8,w-24,1],[12,h/2+7,w-24,1]]),'rgba(236,208,154,0.5)');
                for(let i=0;i<6;i++){const px=30+i*(w-60)/5;disc(s,px,13,5,look.plates,'rgba(0,0,0,0.3)');disc(s,px,h-13,5,look.plates,'rgba(0,0,0,0.3)');}
                wax(s,w*.25,h/2,1.1,look.plates);wax(s,w*.75,h/2,1.1,look.plates);
                disc(s,w/2,h/2,7,look.bloom);disc(s,w/2,h/2,3.5,look.bloom_light);   // a dark bloom
            }else{
                box(s,14,10,26,18,1,look.plates);box(s,18,13,26,18,1,look.runner);   // open books
                disc(s,w-22,h/2,8,null,look.gold,1.2);disc(s,w-22,h/2,3,look.gold_light);   // an astrolabe
            }
        });
        if(piece.candles)art.live(s=>{flame(s,piece,w*.25,h/2,1.1);flame(s,piece,w*.75,h/2,1.1,2);});
    }},
    gothic_chair:{pad:10,draw(art,piece,look){art.still(s=>{             // a high back with a pointed crest, on the side away from its face
        const {width:w,height:h}=piece,f=piece.face||'S',cx=w/2,cy=h/2;
        box(s,0,0,w,h,3,look.seat,look.seat_edge,1);
        s.fill(f==='S'?rect(-1,-4,w+2,6):f==='N'?rect(-1,h-2,w+2,6):f==='E'?rect(-4,-1,6,h+2):rect(w-2,-1,6,h+2),look.back);
        s.fill(f==='S'?rect(cx-1.5,-7,3,3):f==='N'?rect(cx-1.5,h+4,3,3):f==='E'?rect(-7,cy-1.5,3,3):rect(w+4,cy-1.5,3,3),look.crest);
    });}},
    gilt_pew:{draw(art,piece,look){art.still(s=>{
        const {width:w,height:h}=piece;
        box(s,0,0,w,h,3,look.wood,look.wood_light,1);
        s.fill(rect(2,h-5,w-4,4),look.wood_light);                       // the backrest
        s.fill(rects([1,2,3].map(i=>[i*w/4,2,1,h-7])),'rgba(0,0,0,0.25)');
        s.fill(rects([[-1,2,2,h-4],[w-1,2,2,h-4]]),look.gold);
    });}},
    pipe_organ:{draw(art,piece,look){art.still(s=>{                     // gold pipes over a black console
        const {width:w,height:h}=piece,n=15;
        box(s,0,0,w,h,3,look.case,look.gold,1);
        for(let i=0;i<n;i++){const px=6+i*(w-12)/(n-1),tall=.45+.55*Math.abs(Math.sin(i*.55+.4));disc(s,px,6+(1-tall)*12,3.2,look.gold,look.gold_light,.6);}
        box(s,20,h-12,w-40,9,1,look.keys);
        const sharps=[];for(let i=0;i<18;i++)sharps.push([24+i*(w-48)/18,h-12,1.5,5]);s.fill(rects(sharps),look.case);
    });}},
    crystal_altar:{draw(art,piece,look){                                 // black stone, a violet cloth, a Dark Element crystal turning
        const {width:w,height:h}=piece,candles=[[10,10,0],[w-10,10,1],[10,h-10,2],[w-10,h-10,3]];
        art.still(s=>{
            box(s,0,0,w,h,3,look.stone,look.stone_edge,1.5);
            box(s,w*.3,-2,w*.4,h+4,1,look.cloth);
            s.fill(rect(w*.3,h+1,w*.4,1.5),look.gold);
        });
        art.live(s=>{
            const t=piece.time,pulse=.75+.25*Math.sin(t*2.2);
            s.enter({position:[w/2,h/2],rotation:t*.4});
            s.fill([circle(0,0,11)],`rgba(180,120,255,${.35*pulse})`);
            s.fill(polygon([[0,-8],[5,0],[0,8],[-5,0]]),look.crystal);
            s.fill(polygon([[0,-8],[2,0],[0,3],[-2,0]]),look.crystal_light);
            s.leave();
        });
        art.still(s=>{for(const [fx,fy] of candles)wax(s,fx,fy,1,look.wax);});
        art.live(s=>{for(const [fx,fy,k] of candles)flame(s,piece,fx,fy,1,k);});
    }},
    gilt_bookcase:{draw(art,piece,look){art.still(s=>{                  // dark shelves of spines, gold-edged; along its length either way
        const {width:w,height:h}=piece,v=piece.vertical,along=v?h:w,across=v?w:h,cols=look.spines;
        box(s,0,0,w,h,2,look.case,look.gold,.8);
        for(let i=0,k=0;i<along-6;k++){
            const bw=4+((k*7)%5),run=Math.min(bw,along-6-i);
            s.fill(v?rect(3,3+i,across-6,run):rect(3+i,3,run,across-6),cols[k%cols.length]);
            i+=bw+.6;
        }
    });}},
    holo_plinth:{draw(art,piece,look){                                   // a steel plinth, a hologram turning over it
        const {width:w,height:h}=piece,cx=w/2,cy=h/2,r=Math.min(w,h)*.32;
        art.still(s=>box(s,0,0,w,h,5,look.steel,look.steel_edge,1));
        art.live(s=>{
            const t=piece.time;
            s.enter({},{opacity:.75+.2*Math.sin(t*3)});
            disc(s,cx,cy,r,'rgba(127,224,255,0.18)',look.holo,1);
            s.stroke([ellipse(cx,cy,r,r*Math.abs(Math.cos(t*1.3)),t*.7)],look.orbit,1);
            disc(s,cx,cy,2,'#dff8ff');
            s.leave();
        });
    }},
    black_grand:{draw(art,piece,look){art.still(s=>{                    // a black grand, lid open, gold strings, keys to the west
        const {width:w,height:h}=piece;
        s.outlined([['move',0,0],['line',w*.55,0],['cubic',w,0,w,h*.4,w*.8,h],['line',0,h],['close']],look.lacquer,look.gold,1);
        const strings=[];for(let i=0;i<9;i++)strings.push([18,8+i*(h-16)/8,w*.62+i*3,10+i*(h-20)/8]);lines(s,strings,'rgba(236,208,154,0.35)',1);
        box(s,2,6,12,h-12,1,look.keys);
        const sharps=[];for(let i=0;i<12;i++)sharps.push([8,9+i*(h-18)/12,6,2]);s.fill(rects(sharps),look.lacquer);
    });}},
    marble_column:{draw(art,piece,look){art.still(s=>{                  // black marble, a gold capital ring
        const {width:w,height:h}=piece,cx=w/2,cy=h/2;
        disc(s,cx,cy,w/2,look.marble,look.gold,1.5);disc(s,cx,cy,w/2-5,look.marble_light);
        s.stroke([circle(cx,cy,w/2-8,-2.4,-.8)],'rgba(255,255,255,0.08)',1);
    });}},
    rain_fountain:{draw(art,piece,look){                                 // a round basin, rain rippling out, an obsidian spire
        const {width:w,height:h}=piece,cx=w/2,cy=h/2,R=w/2;
        art.still(s=>{disc(s,cx,cy,R,look.basin,look.gold,1.2);disc(s,cx,cy,R-7,look.water);});
        art.live(s=>{for(let i=0;i<3;i++){
            const ph=(piece.time*.5+i/3)%1;
            s.enter({},{opacity:1-ph});s.stroke([circle(cx,cy,12+ph*(R-20))],'rgba(170,200,255,0.3)',1);s.leave();
        }});
        art.still(s=>{disc(s,cx,cy,11,look.spire,look.spire_edge,1);disc(s,cx,cy,4,look.glow);});
    }},
    angel_statue:{draw(art,piece,look){art.still(s=>{                   // a weeping angel on a plinth, wings spread
        const {width:w,height:h}=piece,cx=w/2,cy=h/2;
        box(s,0,0,w,h,3,look.plinth,look.plinth_edge,1);
        s.fill([ellipse(cx-8,cy,9,4,-.5),ellipse(cx+8,cy,9,4,.5)],look.wings);
        disc(s,cx,cy+1,5,look.body);disc(s,cx,cy-4,3,look.head);
    });}},
    gilt_portrait:{draw(art,piece,look){art.still(s=>{                  // a gilt frame on the wall, a dim figure within
        const {width:w,height:h}=piece;
        box(s,0,0,w,h,1,look.frame,look.frame_light,.6);
        box(s,1.5,1.5,w-3,h-3,1,look.canvas);
        s.fill(piece.vertical?rect(2.5,h*.3,w-5,h*.4):rect(w*.3,2.5,w*.4,h-5),'rgba(230,221,208,0.35)');
    });}},
    marble_bust:{draw(art,piece,look){art.still(s=>{                    // a marble head on a black plinth
        const {width:w,height:h}=piece;
        box(s,0,0,w,h,3,look.plinth,look.gold,1);
        disc(s,w/2,h/2+2,w*.3,look.shoulders);disc(s,w/2,h/2-2,w*.2,look.head);
    });}},
    glass_coffin:{draw(art,piece,look){                                  // a hexagonal coffin under violet glass, gold cross-bands
        const {width:w,height:h}=piece;
        art.still(s=>s.outlined(polygon([[0,.5],[.18,0],[.8,.1],[1,.5],[.8,.9],[.18,1]].map(([u,v])=>[u*w,v*h])),look.wood,look.gold,1.5));
        art.live(s=>{const pulse=.6+.4*Math.sin(piece.time*1.7);s.enter({},{opacity:.35+.25*pulse});s.fill([ellipse(w*.52,h/2,w*.3,h*.28)],look.glass);s.leave();});
        art.still(s=>s.fill(rects([[w*.35,4,2,h-8],[w*.2,h/2-1,w*.6,2]]),look.gold));
    }},
    floating_reliquary:{draw(art,piece,look){                            // a glass case on a gold stand, a relic floating inside
        const {width:w,height:h}=piece,[x0,y0]=piece.seed;
        art.still(s=>{box(s,0,0,w,h,3,look.stand,look.gold,1.2);box(s,4,4,w-8,h-8,2,'rgba(180,150,255,0.14)','rgba(220,200,255,0.5)',.8);});
        art.live(s=>disc(s,w/2,h/2+Math.sin(piece.time*2+x0)*1.5,4,look.relics[(x0+y0)%2?0:1%look.relics.length]));   // which relic, and its bob, from where it stands
    }}
};
