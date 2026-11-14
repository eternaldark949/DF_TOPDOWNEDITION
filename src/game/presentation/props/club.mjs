// Moon City Nightclub's furniture families (mc_*): black lacquer, chrome, violet and lavender neon,
// gold, rose-wine velvet. Drawn on the art toolkit as the other venues' are. The stage, the booth and
// the speakers keep the music's kick: `piece.beat` is its beat count, and each piece pulses on the beat.
import {rect,circle,ellipse,radial} from '../../../engine/basement/rendering/index.mjs';
import {box,disc,lines,crescent,dots} from './draw.mjs';

const rects=list=>list.flatMap(([x,y,w,h])=>rect(x,y,w,h));
/** How hard the kick lands now: 1 on the beat, falling away to 0 before the next. */
const kick=piece=>{const beat=((piece.beat%1)+1)%1;return Math.pow(1-beat,3);};
/** Buttons in an n by m grid over the box (x, y, w, h). */
const tufts=(s,X,Y,W,H,n,m,col)=>{const out=[];for(let i=0;i<n;i++)for(let j=0;j<m;j++)out.push([X+(i+.5)*W/n,Y+(j+.5)*H/m,1.1]);s.fill(dots(out),col);};

export const CLUB_ARTISTS={
    club_stage:{draw(art,piece,look){                                    // a raised black stage, a gold lip, a lavender LED strip along the front
        const {width:w,height:h}=piece;
        art.still(s=>{
            box(s,0,0,w,h,6,look.lacquer,look.gold_dark,1.5);
            const boards=[];for(let px=20;px<w;px+=20)boards.push([px,2,px,h-6]);lines(s,boards,'rgba(200,168,255,0.08)',1);
        });
        art.live(s=>box(s,4,h-6,w-8,3,1.5,`rgba(200,168,255,${.55+.4*kick(piece)})`));
        art.still(s=>{
            s.fill(rect(2,h-2,w-4,1.5),look.gold);
            s.enter({},{opacity:.5});s.fill(crescent(w/2,16,9,w/2+4,14,8),look.logo);s.leave();   // the crescent on the backdrop
        });
    }},
    dj_booth:{pad:9,draw(art,piece,look){                                // two decks, a mixer, a laptop, an LED strip
        const {width:w,height:h}=piece,x0=piece.seed[0];
        art.still(s=>box(s,0,0,w,h,4,look.booth,look.chrome_dark,1));
        art.live(s=>box(s,2,h-5,w-4,3,1.5,`rgba(255,90,138,${.5+.5*kick(piece)})`));
        for(const cx of [26,w-26]){
            art.still(s=>{
                disc(s,cx,17,13,'#1e1a24',look.chrome_dark,1);disc(s,cx,17,11,'#0a080c');
                for(const r of [4,7,9.5])s.stroke([circle(cx,17,r)],'rgba(200,168,255,0.25)',.6);
            });
            art.live(s=>{const a=piece.time*4.2+x0+cx;lines(s,[[cx,17,cx+Math.cos(a)*10,17+Math.sin(a)*10]],look.lilac,1);});   // the needle, turning with its record
            art.still(s=>disc(s,cx,17,2,look.gold));
        }
        art.still(s=>{
            box(s,w/2-14,5,28,26,2,'#1a1620','#3a3644',.8);                 // the mixer
            box(s,w/2-12,-4,24,8,1,'#2a2632',look.chrome_dark,.8);box(s,w/2-10,-3,20,5,1,'rgba(160,200,255,0.8)');   // the laptop
        });
        art.live(s=>{const p=kick(piece);for(let i=0;i<4;i++){const lv=.3+.7*Math.abs(Math.sin(piece.time*3+i*1.3))*(.5+.5*p);box(s,w/2-11+i*6,27-18*lv,3,18*lv,1,i<2?look.lavender:look.rose);}});   // the meters
    }},
    speaker_stack:{draw(art,piece,look){                                 // two woofers breathing on the kick, a tweeter
        const {width:w,height:h}=piece;
        art.still(s=>box(s,0,0,w,h,3,look.cabinet,look.cabinet_edge,1.2));
        art.live(s=>{const k=1+.08*kick(piece);for(const cy of [h*.33,h*.72]){disc(s,w/2,cy,w*.34*k,'#1f1a26',look.chrome_dark,1);disc(s,w/2,cy,w*.16*k,'#0a080c');disc(s,w/2,cy,w*.05,look.chrome_dark);}});
        art.still(s=>disc(s,w/2,7,3,'#2a2632',look.chrome_dark,.6));
    }},
    dance_pole:{draw(art,piece,look){art.still(s=>{                     // chrome on a lit plinth (the plinth ring is floor art, the glow the lighting's)
        const cx=piece.width/2,cy=piece.height/2;
        disc(s,cx,cy,5,radial([cx-1.5,cy-1.5],.5,[cx,cy],5,[[0,'#ffffff'],[.5,look.chrome],[1,look.chrome_dark]]));disc(s,cx,cy,5,null,look.gold,1);
    });}},
    high_top:{draw(art,piece,look){art.still(s=>{                       // marble on a chrome ring, a cocktail, a candle
        const cx=piece.width/2,cy=piece.height/2,R=piece.width/2;
        disc(s,cx,cy,R,look.marble,look.gold,1.5);
        s.stroke([['move',cx-R+4,cy-3],['quadratic',cx,cy+4,cx+R-5,cy-6]],'rgba(120,100,140,0.35)',.6);
        disc(s,cx-4,cy+2,3.2,'rgba(255,90,138,0.8)',look.chrome,.7);disc(s,cx+5,cy-3,2.2,'#fff2d8');
    });}},
    club_booth:{draw(art,piece,look){art.still(s=>{                     // a curved velvet booth round a marble table, facing north
        const {width:w,height:h}=piece;
        s.outlined([['move',0,10],['quadratic',0,h,20,h],['line',w-20,h],['quadratic',w,h,w,10],['line',w-16,10],['quadratic',w-16,h-16,w-30,h-16],['line',30,h-16],['quadratic',16,h-16,16,10],['close']],look.velvet_dark,look.gold,1);
        tufts(s,24,h-13,w-48,10,6,1,'rgba(255,190,220,0.35)');
        s.fill([['move',16,10],['quadratic',16,h-16,30,h-16],['line',w-30,h-16],['quadratic',w-16,h-16,w-16,10],['line',w-26,10],['quadratic',w-26,h-26,w-36,h-26],['line',36,h-26],['quadratic',26,h-26,26,10],['close']],look.velvet_light);
        s.outlined([ellipse(w/2,16,26,13)],look.marble,look.gold,1.3);
        disc(s,w/2-8,16,2.8,'rgba(255,240,200,0.9)',look.gold,.7);disc(s,w/2+2,13,2.8,'rgba(255,240,200,0.9)',look.gold,.7);disc(s,w/2+12,18,2,'#fff2d8');
    });}},
    back_bar:{draw(art,piece,look){art.still(s=>{                       // mirrored shelves of bottles, lit from beneath
        const {width:w,height:h}=piece,cols=look.bottles,x0=piece.seed[0]|0;
        box(s,0,0,w,h,2,look.lacquer,look.gold_dark,1);
        box(s,2,2,6,h-4,1,'rgba(200,168,255,0.18)');                     // the mirror strip against the wall
        for(let by=8,i=0;by<h-6;by+=9,i++){const bx=12+(i%2)*5;disc(s,bx,by,2.6,cols[(i*5+x0)%cols.length],'rgba(0,0,0,0.5)',.6);disc(s,bx,by,1,'rgba(255,255,255,0.7)');}
        s.fill(rect(w-2,2,1.2,h-4),look.gold);
    });}},
    club_bar:{draw(art,piece,look){art.still(s=>{                       // black marble veined gold, a curved gold rail, a row of gold taps
        const {width:w,height:h}=piece;
        s.outlined([['move',0,0],['line',w-14,0],['quadratic',w,h/2,w-14,h],['line',0,h],['close']],look.top,look.gold_dark,1);
        const veins=[];for(let vy=20;vy<h;vy+=46)veins.push(['move',4,vy],['cubic',14,vy+12,24,vy-6,w-16,vy+14]);s.stroke(veins,'rgba(232,194,122,0.3)',.7);
        s.stroke([['move',w-12,4],['quadratic',w+1,h/2,w-12,h-4]],look.gold,3);   // the rail
        s.stroke([['move',w-13,6],['quadratic',w-1,h/2,w-13,h-6]],look.gold_light,.8);
        box(s,2,h/2-34,10,68,2,'#2a2230',look.gold_dark,.8);              // the taps
        for(let i=0;i<6;i++){disc(s,7,h/2-28+i*11,2.6,look.gold,look.gold_light,.6);box(s,10,h/2-29+i*11,6,2,1,look.gold_dark);}
        for(const [gx,f] of [[22,.12],[26,.3],[20,.7],[24,.9]])disc(s,gx,h*f,3,'rgba(255,240,200,0.85)',look.gold,.7);
        disc(s,24,h*.22,3.2,'rgba(255,90,138,0.85)',look.chrome,.7);disc(s,22,h*.8,3.2,'rgba(200,168,255,0.85)',look.chrome,.7);
    });}},
    club_stool:{draw(art,piece,look){art.still(s=>{                     // chrome and velvet
        const cx=piece.width/2,cy=piece.height/2,w=piece.width;
        disc(s,cx,cy,w/2,look.chrome_dark,look.chrome,1.2);disc(s,cx,cy,w/2-3,look.seat);disc(s,cx-2,cy-2,2.5,'rgba(255,190,220,0.3)');
    });}},
    coat_check:{pad:17,draw(art,piece,look){art.still(s=>{              // a lacquer counter, a bell, tickets; the coat rail behind
        const {width:w,height:h}=piece;
        box(s,2,-14,w-4,10,3,'#120c18');
        lines(s,[[6,-9,w-6,-9]],look.chrome_dark,1.5);
        for(let i=0;i<11;i++)box(s,8+i*12.5,-13,9,9,3,look.coats[i%look.coats.length],'rgba(255,255,255,0.08)',.6);
        box(s,0,0,w,h,4,look.lacquer_light,look.gold,1.5);box(s,4,4,w-8,h-8,3,look.lacquer);
        disc(s,22,h/2,4.5,look.gold,look.gold_light,.8);disc(s,22,h/2,1.3,look.gold_light);
        for(let i=0;i<4;i++)box(s,50+i*12,h/2-5,9,10,1,i%2?look.lilac:look.gold_light,'rgba(0,0,0,0.3)',.5);
        box(s,w-40,h/2-7,26,14,2,'#0a080c',look.chrome_dark,.8);box(s,w-38,h/2-5,22,10,1,'rgba(200,168,255,0.55)');
    });}},
    velvet_rope:{loop:{period:2*Math.PI/1.4,frames:12},draw(art,piece,look){art.still(s=>{   // sagging between chrome-and-gold stanchions, swaying
        const {width:w,height:h}=piece,posts=Math.max(2,Math.round(h/36)+1),vert=h>w;
        const P=i=>vert?[w/2,i*h/(posts-1)]:[i*w/(posts-1),h/2];
        s.enter({},{line_cap:'round'});
        for(let i=0;i<posts-1;i++){
            const [ax,ay]=P(i),[bx,by]=P(i+1),sway=Math.sin(piece.time*1.4+i)*.6;
            const rope=[['move',ax,ay],['quadratic',(ax+bx)/2+(vert?5+sway:0),(ay+by)/2+(vert?0:5+sway),bx,by]];
            s.stroke(rope,look.rope,3);s.stroke(rope,'rgba(255,160,200,0.35)',1);
        }
        s.leave();
        for(let i=0;i<posts;i++){const [px,py]=P(i);disc(s,px,py,5,look.chrome_dark,look.chrome,1);disc(s,px,py,2.4,look.gold);}
    });}},
    button_bench:{draw(art,piece,look){art.still(s=>{                   // buttoned velvet on gold feet
        const {width:w,height:h}=piece;
        box(s,0,0,w,h,8,look.velvet,look.gold,1);box(s,4,4,w-8,h-8,6,look.seat);tufts(s,6,6,w-12,h-12,7,2,'rgba(255,190,220,0.4)');
    });}},
    moon_orb:{draw(art,piece,look){                                      // a moon floating over a black plinth, turning slowly
        const {width:w,height:h}=piece,cx=w/2,cy=h/2,R=w*.3;
        art.still(s=>disc(s,cx,cy,w/2,look.plinth,look.gold_dark,1.2));
        art.live(s=>{
            const t=piece.time,oy=cy-3+Math.sin(t*1.5+piece.seed[0])*2;
            disc(s,cx,oy,R,radial([cx-R*.35,oy-R*.35],1,[cx,oy],R,[[0,'#ffffff'],[.6,look.moon],[1,look.moon_dark]]));
            const craters=[];for(const [a,r] of [[t*.3,.45],[t*.3+2,.3],[t*.3+4,.55]]){const c=Math.cos(a);if(c>-.2)craters.push([cx+c*R*r,oy+Math.sin(a*1.3)*R*.3,R*.16]);}
            if(craters.length)s.fill(dots(craters),'rgba(120,100,160,0.35)');
        });
    }},
    bulb_vanity:{draw(art,piece,look){                                   // marble, round sinks, a mirror strip lit with bulbs on the wall side
        const {width:w,height:h}=piece,north=piece.face!=='N',my=north?-4:h-2,x0=piece.seed[0];   // (against the north wall unless it faces north)
        art.still(s=>box(s,0,my,w,6,2,'rgba(200,190,230,0.55)',look.gold,1));
        art.live(s=>{for(let bx=8;bx<w-4;bx+=16)disc(s,bx,my+3,1.7,`rgba(255,236,200,${.8+.2*Math.sin(piece.time*2+x0+bx)})`);});
        art.still(s=>{
            box(s,0,0,w,h,3,look.marble,look.gold_dark,1);
            const veins=[];for(let vx=10;vx<w;vx+=38)veins.push(['move',vx,2],['quadratic',vx+12,h/2,vx+4,h-2]);s.stroke(veins,'rgba(140,120,160,0.25)',.6);
            const n=Math.max(2,Math.floor(w/55));
            for(let i=0;i<n;i++){
                const sx=(i+.5)*w/n,sy=h/2+(north?2:-2);
                s.outlined([ellipse(sx,sy,11,8)],look.porcelain,look.marble_dark,.8);s.fill([ellipse(sx,sy,7,5)],'#d8d4e4');
                disc(s,sx,sy,1,'#6a6e82');box(s,sx-1,north?2:h-8,2,6,1,look.gold);
            }
            if(w>150){disc(s,w-14,h/2,3,'#e8b4c8');disc(s,w-22,h/2+2,2.4,look.lilac);}   // perfume
        });
    }},
    toilet_stall:{draw(art,piece,look){art.still(s=>{                   // against the west wall, the door on the east side ajar a hair
        const {width:w,height:h}=piece;
        box(s,0,0,w,h,2,look.tile);
        const grout=[];for(let gx=10;gx<w;gx+=10)grout.push([gx,0,gx,h]);for(let gy=10;gy<h;gy+=10)grout.push([0,gy,w,gy]);lines(s,grout,'rgba(0,0,0,0.08)',.6);
        s.outlined([ellipse(20,h/2,12,9)],look.porcelain,look.marble_dark,.8);s.fill([ellipse(21,h/2,7,5)],'#b8c8e0');   // the bowl
        box(s,3,h/2-10,6,20,2,look.porcelain,look.marble_dark,.6);      // the cistern
        s.fill(rects([[0,0,w,4],[0,h-4,w,4]]),look.partition);s.fill(rects([[0,3,w,1],[0,h-4,w,1]]),look.gold_dark);
        box(s,w-5,4,5,h-8,1,look.door,look.gold,.8);
        disc(s,w-2.5,h/2,1.2,look.gold);box(s,w-4,h/2+6,3,4,.5,'#4ad07a');   // the handle, VACANT
    });}},
    urinal:{draw(art,piece,look){art.still(s=>{                         // wall-hung porcelain, a gold flush plate
        const {width:w,height:h}=piece;
        s.outlined([['move',0,0],['line',w,0],['line',w-2,h*.6],['quadratic',w/2,h+2,2,h*.6],['close']],look.porcelain,look.marble_dark,.8);
        s.fill([ellipse(w/2,h*.5,w*.28,h*.28)],'#c8d4e8');
        box(s,w/2-3,1,6,3,1,look.gold);
    });}},
    hand_dryer:{draw(art,piece,look){art.still(s=>{                     // chrome, a blue ready-light
        const {width:w,height:h}=piece;
        box(s,0,0,w,h,4,look.chrome_dark,look.chrome,1);
        if(piece.vertical){box(s,3,6,w-6,h-12,3,'#2a2e3a');disc(s,w/2,4,1.4,look.light);}
        else{box(s,6,3,w-12,h-6,3,'#2a2e3a');disc(s,4,h/2,1.4,look.light);}
    });}},
    blush_settee:{draw(art,piece,look){art.still(s=>{                   // tufted, gold-footed, the back against the east side
        const {width:w,height:h}=piece;
        box(s,0,0,w,h,12,look.fabric,look.gold,1);
        box(s,w-12,4,10,h-8,5,look.fabric_dark);box(s,4,4,w-18,20,8,look.fabric_dark);
        tufts(s,6,28,w-20,h-34,2,5,'rgba(255,220,235,0.55)');
        box(s,8,h-34,16,12,4,look.cushion);
    });}},
    crescent_sofa:{draw(art,piece,look){art.still(s=>{                  // a crescent of wine velvet, the back to the north wall
        const {width:w,height:h}=piece;
        s.outlined([['move',0,0],['line',w,0],['quadratic',w,h,w/2,h],['quadratic',0,h,0,0]],look.velvet_dark,look.gold,1.5);
        s.fill([['move',14,12],['line',w-14,12],['quadratic',w-16,h-12,w/2,h-10],['quadratic',16,h-12,14,12]],look.velvet_light);
        s.fill([['move',30,12],['line',w-30,12],['quadratic',w-34,h-26,w/2,h-24],['quadratic',34,h-26,30,12]],look.velvet);
        tufts(s,20,3,w-40,7,9,1,'rgba(255,190,220,0.45)');
        box(s,40,16,18,12,5,look.cushions[0]);box(s,w-58,16,18,12,5,look.cushions[1%look.cushions.length]);
    });}},
    champagne_table:{draw(art,piece,look){art.still(s=>{                // black glass on gold: champagne on ice, two flutes, rose petals
        const {width:w,height:h}=piece,cx=w/2,cy=h/2,m=Math.min(w,h);
        box(s,0,0,w,h,6,'rgba(20,14,28,0.92)',look.gold,1.5);
        s.fill(rect(4,3,w-8,1.5),'rgba(200,168,255,0.12)');
        disc(s,cx,cy,m*.22,look.chrome,look.chrome_dark,1);disc(s,cx,cy,m*.16,'#e8f0ff');   // the ice bucket
        disc(s,cx+1,cy-1,2.8,'#1e3a24',look.gold,.8);                   // the bottle's neck
        disc(s,cx-w*.3,cy+h*.18,2.6,'rgba(255,240,200,0.9)',look.gold,.6);disc(s,cx+w*.3,cy-h*.18,2.6,'rgba(255,240,200,0.9)',look.gold,.6);
        for(let i=0;i<4;i++)s.fill([ellipse(6+(i*13%(w-10)),h-5-(i%2)*3,2.2,1.3,i)],look.petals[i%2?0:1%look.petals.length]);
    });}},
    suite_couch:{draw(art,piece,look){art.still(s=>{                    // a long velvet couch, the back against the east wall, facing west
        const {width:w,height:h}=piece;
        box(s,0,0,w,h,12,look.velvet_dark,look.gold,1.2);
        box(s,w-16,4,14,h-8,7,look.velvet);
        box(s,4,4,w-22,16,7,look.velvet);box(s,4,h-20,w-22,16,7,look.velvet);
        box(s,6,22,w-24,h-44,6,look.velvet_light);tufts(s,w-15,8,12,h-16,1,9,'rgba(255,190,220,0.4)');
        lines(s,[1,2].map(k=>[6,22+k*(h-44)/3,w-18,22+k*(h-44)/3]),'rgba(0,0,0,0.25)',1);
        box(s,10,30,14,18,5,look.cushions[0]);box(s,10,h-50,14,18,5,look.cushions[1%look.cushions.length]);
    });}}
};
