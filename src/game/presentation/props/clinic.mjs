// The clinic's furniture families (medbay_sw): white enamel, steel, teal. Drawn on the art toolkit as
// the other venues' are; the vitals monitor's trace scrolls and the plant sways, live.
import {rect,circle,ellipse} from '../../../engine/basement/rendering/index.mjs';
import {box,disc} from './draw.mjs';

const TAU=Math.PI*2;

export const CLINIC_ARTISTS={
    hospital_bed:{draw(art,piece,look){art.still(s=>{                   // the frame, a pillow at the head, the blanket; someone resting, or not
        const {width:w,height:h}=piece,L=look.head!=='right';
        box(s,0,0,w,h,6,look.frame,look.frame_edge,1.5);
        box(s,4,4,w-8,h-8,5,look.mattress);
        box(s,L?7:w-29,9,22,h-18,6,'#ffffff','rgba(0,0,0,0.12)',1);    // the pillow
        const bx=L?34:5,bw=w-40;
        box(s,bx,5,bw,h-10,5,look.blanket);
        s.fill(rect(L?bx:bx+bw-7,5,7,h-10),'rgba(255,255,255,0.18)'); // the folded sheet's edge
        const folds=[];for(let i=1;i<4;i++){const fx=bx+bw*i/4;folds.push(['move',fx,8],['quadratic',fx+4,h/2,fx,h-8]);}
        s.stroke(folds,'rgba(0,0,0,0.12)',1);
        if(look.patient){
            const hx=L?18:w-18;
            disc(s,hx,h/2,8,look.skin);
            s.fill([ellipse(hx+(L?-2:2),h/2,8,8,0,L?1.2:-1.9,L?5.1:1.9)],look.hair);
            box(s,L?30:w-70,8,40,h-16,8,look.body);                     // under the blanket
        }
        s.fill([...rect(L?30:10,-1,w-42,3),...rect(L?30:10,h-2,w-42,3)],look.rails);
    });}},
    vitals_monitor:{draw(art,piece,look){                               // on a cart: a heartbeat trace scrolling across the screen
        const {width:w,height:h}=piece;
        art.still(s=>{box(s,0,0,w,h,3,look.cart,look.cart_edge,1);box(s,2,2,w-4,h-8,2,look.screen);});
        art.live(s=>{
            s.enter();s.clip(rect(2,2,w-4,h-8));
            const mid=2+(h-8)/2,sw=w-4,trace=[];
            for(let i=0;i<=sw;i++){const ph=((i/sw)*2+piece.time*1.2+piece.seed[0]*.01)%1,spike=ph>.45&&ph<.55?Math.sin((ph-.45)*Math.PI*20)*(h-10)*.45:0;trace.push([i?'line':'move',2+i,mid-spike]);}
            s.paint(trace,{stroke:look.trace,stroke_width:1,shadow:{color:look.trace,blur:4}});
            s.leave();
        });
        art.still(s=>disc(s,w-4,h-3,1.3,look.alarm));
    }},
    iv_stand:{draw(art,piece,look){art.still(s=>{                       // base spokes, the pole, the bag
        const {width:w,height:h}=piece,cx=w/2,cy=h/2;
        for(let i=0;i<5;i++){const a=i*TAU/5;s.stroke([['move',cx,cy],['line',cx+Math.cos(a)*7,cy+Math.sin(a)*7]],look.steel,1.5);}
        disc(s,cx,cy,2,look.pole);
        box(s,cx-4,cy-5,8,10,3,'rgba(200,235,255,0.55)','rgba(255,255,255,0.8)',.8);
        s.fill(rect(cx-3,cy-1,6,5),look.fluid);
    });}},
    pharmacy_cabinet:{draw(art,piece,look){art.still(s=>{               // glass-fronted: bottles and boxes in rows, a sheen
        const {width:w,height:h}=piece,cols=look.stock,x0=Math.floor(piece.seed[0]);
        box(s,0,0,w,h,3,look.case,look.case_edge,1.5);
        box(s,3,3,w-6,h-6,2,look.glass);
        for(let i=0,n=Math.floor((w-10)/9);i<n;i++){
            const bx=6+i*9;
            disc(s,bx+3,10,2.6,cols[(i*7+x0)%cols.length]);
            s.fill(rect(bx+1,16,5,7),cols[(i*3+1)%cols.length]);
        }
        s.fill([['move',w*.2,3],['line',w*.32,3],['line',w*.22,h-3],['line',w*.1,h-3]],'rgba(255,255,255,0.25)');
    });}},
    reception_counter:{draw(art,piece,look){art.still(s=>{              // its screens face the doctor (north); papers, a mug
        const {width:w,height:h}=piece;
        box(s,0,0,w,h,6,look.top,look.edge,1.5);
        box(s,4,h-9,w-8,5,2,look.trim);
        for(const sx of [30,w-56]){box(s,sx,4,26,5,1,look.bezel);s.paint(rect(sx+2,5,22,2.4),{fill:look.glow,shadow:{color:look.glow,blur:6}});}
        s.enter({position:[w/2-6,14],rotation:-.15});s.fill(rect(0,0,12,9),'#ffffff');s.fill([...rect(2,2,8,1),...rect(2,5,6,1)],'#c9d1d6');s.leave();
        disc(s,20,17,3.5,'#fafafa');disc(s,20,17,2.4,'#5a3b22');
    });}},
    waiting_bench:{draw(art,piece,look){art.still(s=>{                  // three padded seats on a steel frame
        const {width:w,height:h}=piece;
        box(s,0,0,w,h,5,look.frame);
        for(let i=0;i<3;i++)box(s,4+i*(w-8)/3,4,(w-8)/3-3,h-8,5,look.seat,'rgba(255,255,255,0.15)',1);
    });}},
    water_cooler:{draw(art,piece,look){art.still(s=>{                   // the bottle seen from above
        const {width:w,height:h}=piece;
        box(s,0,0,w,h,4,look.body,look.edge,1);
        disc(s,w/2,h/2,w*.36,look.water);disc(s,w/2-3,h/2-3,2.2,'rgba(255,255,255,0.7)');
    });}},
    clinic_plant:{loop:{period:TAU/.8,frames:10},draw(art,piece,look){  // a potted plant, its leaves stirring (one sway, painted as phase frames)
        const {width:w,height:h}=piece,cx=w/2,cy=h/2;
        art.still(s=>{disc(s,cx,cy,w*.42,look.pot);for(let i=0;i<7;i++){const a=i*.9+Math.sin(piece.time*.8+i)*.05,r=w*(.2+(i%3)*.08);s.fill([ellipse(cx+Math.cos(a)*r,cy+Math.sin(a)*r,w*.2,w*.1,a)],look.leaves[i%look.leaves.length]);}});
    }}
};
