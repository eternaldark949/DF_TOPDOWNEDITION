// Enni Cole's furniture families (ec_*): a department store in rose stone, walnut and brass, both
// floors. Drawn on the art toolkit as the other venues' are. The store's goods (bottles, garments,
// aisle stock) are arranged by the piece's number, so a map picks a counter's stock as it did.
import {rect,circle,ellipse,polygon,linear,radial} from '../../../engine/basement/rendering/index.mjs';
import {box,disc,lines,turned} from './draw.mjs';

const TAU=Math.PI*2,BRASS='#b0844c',BRIGHT='#ead5a6',ROSE='#2b2328',DARK='#262328',WALNUT='#493428',CREAM='#e8ddd0',IVORY='#f4eadc';
/** A brass-ringed disc, as the classic art's `dot`: its outline a hairline. */
const dot=(s,x,y,r,fill,stroke)=>disc(s,x,y,r,fill,stroke,.8);
/** A centred Georgia caption, as the store signs its counters. */
const caption=(s,str,x,y,size=9,fill=BRIGHT)=>s.text(str,x,y,{font:{family:'Georgia, serif',size},align:'center',baseline:'middle'},{fill});
/** The brass-edged plinth most counters stand on, its dark well inside. */
const plinth=(s,w,h,fill)=>{box(s,0,0,w,h,7,fill,BRASS,1.5);box(s,5,5,w-10,h-10,4,'#201e21');};
/** A wine bottle standing at (x, y): its body, neck, label and a glint. */
function bottle(s,x,y,fill){box(s,x-3,y-7,6,16,2,fill);box(s,x-1.3,y-12,2.6,6,1,DARK);box(s,x-2.5,y-3,5,5,.5,'#d6c3a2');s.fill(rect(x-2,y-6,1,12),'rgba(255,255,255,.22)');}
/** A brass-framed screen showing one of three soft landscapes. */
function screen(s,x,y,w,h,k){
    box(s,x,y,w,h,3,DARK,BRASS,1.2);
    box(s,x+3,y+3,w-6,h-6,1.5,linear([-w/2,-h/2],[w/2,h/2],[[0,['#172f44','#421f4a','#1d383b'][k%3]],[1,['#79a1b5','#b888b7','#a6b5a3'][k%3]]]));
    s.enter();s.clip(rect(x+3,y+3,w-6,h-6));
    s.enter({},{opacity:.45});s.fill([['move',x+3,y+h-3],['cubic',x+w*.32,y-h*.2,x+w*.5,y+h*1.4,x+w-3,y+3],['line',x+w-3,y+h-3],['close']],['#e2c29e','#d5c2e4','#dfd5b3'][k%3]);s.leave();
    s.enter({},{opacity:.28});s.fill([circle(x+w*.7,y+h*.3,Math.min(w,h)*.15)],'#fff4dc');s.leave();
    s.leave();
    s.fill(rect(x+w/2-1,y+h-1,2,1),'#efdeb5');
}

export const ENNI_ARTISTS={
    wine_plinth:{draw(art,piece,look){art.still(s=>{                     // two racks of bottles either side of a brass rule
        const {width:w,height:h}=piece;
        plinth(s,w,h,look.wood);box(s,7,7,w-14,h-14,3,'#553b2d');
        for(let i=0;i<Math.floor((w-24)/17);i++)for(let j=0;j<2;j++)bottle(s,15+i*17,19+j*25,look.bottles[(i+j)%look.bottles.length]);
        s.stroke([['move',8,h/2],['line',w-8,h/2]],'rgba(224,191,130,.65)',1);
        caption(s,look.label,w/2,h-3,8);
    });}},
    chilled_counter:{draw(art,piece,look){art.still(s=>{                 // seven glass-fronted cabinets of cheese and charcuterie
        const {width:w,height:h}=piece,count=7,bw=(w-16)/count;
        plinth(s,w,h,'#495458');box(s,6,6,w-12,h-15,3,'#9aaeb0');
        for(let i=0;i<count;i++){
            const X=8+i*bw;box(s,X+2,11,bw-6,h-28,2,'#879f9f',BRASS,.8);
            for(let j=0;j<3;j++){const xx=X+10+j*11;box(s,xx,20,8,16,1,['#ece3cf','#e1c97f','#c8b1a9'][j]);box(s,xx,43,8,12,1,['#e5daca','#aa7b60','#c9d5b4'][(i+j)%3]);}
            s.fill(rect(X+5,12,4,h-31),'rgba(232,250,255,.22)');s.stroke([['move',X+6,12],['line',X+bw-10,h-18]],'rgba(245,255,255,.28)',.8);
        }
        caption(s,look.label,w/2,h-5,8);
    });}},
    bakery_case:{draw(art,piece,look){art.still(s=>{                     // loaves in two rows under a glass case
        const {width:w,height:h}=piece;
        plinth(s,w,h,WALNUT);box(s,6,6,w-12,h-15,4,'#c4a782');
        for(let i=0;i<Math.floor((w-20)/23);i++)for(let j=0;j<2;j++){
            const X=17+i*23,Y=23+j*24;s.fill([ellipse(X,Y,9,5,-.2)],(i+j)%2?'#d6ac6c':'#a36b42');
            lines(s,[[X-4,Y-2,X-2,Y+2],[X+1,Y-2,X+3,Y+2]],'#efd4a4',1);
        }
        box(s,5,5,w-10,h-14,4,'rgba(222,244,245,.08)','rgba(255,248,225,.55)',1);caption(s,look.label,w/2,h-4,8);
    });}},
    cream_sofa:{draw(art,piece,look){art.still(s=>turned(s,piece,(X,Y,W,H)=>{   // cream upholstery in a brass-piped frame; a sofa wears two cushions
        box(s,X,Y,W,H,10,look.frame,BRASS,1.5);box(s,X+5,Y+5,W-10,H-10,8,CREAM);
        box(s,X+6,Y+4,W-12,14,5,'#cdb8a6','#af9279',.6);
        const n=look.seats,cw=(W-26)/n;
        for(let k=0;k<n;k++)box(s,X+13+k*cw,Y+22,cw-2,H-30,6,'#e9dbca','#c5b2a0',.8);
        box(s,X+4,Y+8,9,H-15,5,'#d5c2b1');box(s,X+W-13,Y+8,9,H-15,5,'#d5c2b1');
        if(n>1){box(s,X+22,Y+25,19,16,4,ROSE,'#9b6579');box(s,X+W-43,Y+24,19,16,4,'#b7a88c');}
    }));}},
    brass_low_table:{draw(art,piece,look){art.still(s=>{                 // a cream-topped table: a vein, two books, a bowl
        const {width:w,height:h}=piece;
        box(s,0,0,w,h,12,BRASS,DARK,1.2);box(s,3,3,w-6,h-6,10,'#efded0');
        s.stroke([['move',11,h-10],['cubic',w*.4,-2,w*.52,h,w-8,8]],'rgba(143,104,98,.18)',1);
        box(s,16,16,25,20,1,'#765963',BRASS,.6);box(s,20,13,25,20,1,'#b39a83');dot(s,w-25,h/2,9,'#d4bd9a',BRASS);dot(s,w-25,h/2,4,'#4f5c41');
    });}},
    walnut_side_table:{draw(art,piece,look){art.still(s=>{               // a walnut table with a lamp seen from above
        const {width:w,height:h}=piece,m=Math.min(w,h);
        box(s,0,0,w,h,5,WALNUT,BRASS,1);box(s,3,3,w-6,h-6,4,'#70523d');
        dot(s,w/2,h/2,m*.24,'#eee2c7',BRASS);dot(s,w/2,h/2,m*.15,'#d8c8a9',BRASS);dot(s,w/2,h/2,3,'#fff2cb');
    });}},
    emporium_bed:{draw(art,piece,look){art.still(s=>{                    // a showroom bed: headboard, pillows, a turned-down cover and a runner
        const {width:w,height:h}=piece;
        box(s,0,0,w,h,9,'#65404b',BRASS,1.5);box(s,5,7,w-10,h-13,7,IVORY);
        box(s,3,3,w-6,23,8,'#875768','#b17d89');
        box(s,15,35,w/2-22,33,7,'#ece2d7','#c1ad9b',.7);box(s,w/2+7,35,w/2-22,33,7,'#ece2d7','#c1ad9b',.7);
        box(s,9,79,w-18,h-89,4,'#c5b4a5');box(s,9,h*.6,w-18,h*.24,2,look.runner);
        lines(s,[[10,h*.64,w-10,h*.64],[10,h*.8,w-10,h*.8]],'rgba(241,223,191,.5)',1);
        const folds=[];for(let X=18;X<w-10;X+=15)folds.push([X,87,X+2,h-10]);lines(s,folds,'rgba(97,74,56,.16)',1);
    });}},
    emporium_dining:{draw(art,piece,look){art.still(s=>{                 // a walnut table for six, the chairs inside its footprint
        const {width:w,height:h}=piece;
        for(let i=0;i<3;i++){box(s,14+i*55,0,33,24,6,ROSE,BRASS);box(s,14+i*55,h-24,33,24,6,ROSE,BRASS);}
        box(s,4,22,w-8,h-44,18,WALNUT,BRASS,1.3);box(s,8,26,w-16,h-52,16,'#73503b');
        for(let i=0;i<3;i++)for(const Y of [37,h-37]){const X=29+i*55;dot(s,X,Y,8,'#e8ddc7',BRASS);dot(s,X,Y,5,'#f4ead6');}
        dot(s,w/2,h/2,9,'#bda26b',BRASS);dot(s,w/2,h/2,5,'#627446');
    });}},
    screen_wall:{draw(art,piece,look){art.still(s=>{                     // three televisions on the home-cinema plinth
        const {width:w,height:h}=piece;
        plinth(s,w,h,WALNUT);for(let i=0;i<3;i++)screen(s,12+i*122,9,112,42,i);caption(s,look.label,w/2,h-4,8);
    });}},
    laptop_plinth:{draw(art,piece,look){art.still(s=>{                   // three open laptops on a cream counter
        const {width:w,height:h}=piece;
        plinth(s,w,h,'#594235');box(s,5,5,w-10,h-10,4,'#ddcbb2');
        for(let i=0;i<3;i++){
            const X=13+i*52,keys=[];screen(s,X,12,42,24,i);box(s,X-2,37,46,31,3,'#969ca0','#54585a',.7);
            for(let j=0;j<4;j++)for(let k=0;k<6;k++)keys.push(...rect(X+3+k*6,41+j*4,4,2));s.fill(keys,'#3b4045');
            box(s,X+12,59,15,6,1,'#afb2b3','#74787c',.5);
        }
        caption(s,look.label,w/2,h-5,8,DARK);
    });}},
    tablet_plinth:{draw(art,piece,look){art.still(s=>{                   // three tablets standing on a cream counter
        const {width:w,height:h,variant}=piece;
        plinth(s,w,h,'#594235');box(s,5,5,w-10,h-10,4,'#ddcbb2');
        for(let i=0;i<3;i++){const X=12+i*35;screen(s,X,14,27,43,i+variant);dot(s,X+13.5,54,1,'#eee1bf');}
        caption(s,variant?look.label_alt:look.label,w/2,h-10,7,DARK);
    });}},
    speaker_plinth:{draw(art,piece,look){art.still(s=>{                  // three speakers, woofer and tweeter each
        const {width:w,height:h}=piece;
        plinth(s,w,h,'#594235');box(s,5,5,w-10,h-10,4,'#ddcbb2');
        for(let i=0;i<3;i++){const X=15+i*53;box(s,X,12,36,50,5,'#383238',BRASS,.9);dot(s,X+18,29,11,'#1b1c20','#635b5c');dot(s,X+18,49,6,'#1d2025','#827460');dot(s,X+18,29,3,'#887e72');}
        caption(s,look.label,w/2,h-8,8,DARK);
    });}},
    appliance_plinth:{draw(art,piece,look){art.still(s=>{                // a washer, a hob, an oven and a dryer
        const {width:w,height:h}=piece;
        plinth(s,w,h,'#594235');box(s,5,5,w-10,h-10,4,'#ddcbb2');
        for(let i=0;i<4;i++){const X=17+i*93;box(s,X,12,68,48,5,['#c4c6c5','#343537','#d2cec4','#949999'][i],DARK,1);
            if(i===0||i===3){dot(s,X+34,37,16,'#242c31','#efddbd');dot(s,X+34,37,11,'#738289');}
            else if(i===1){for(let k=0;k<4;k++)dot(s,X+20+(k%2)*27,24+(k/2|0)*22,9,'#191c20','#86888a');}
            else{box(s,X+8,19,52,25,2,'#2b343c','#a89f92');s.fill(rect(X+49,24,6,4),'#88abc0');}
        }
        caption(s,look.label,w/2,h-7,8,DARK);
    });}},
    checkout_desk:{draw(art,piece,look){art.still(s=>{                   // a rose desk: a till screen, a card reader, a posy
        const {width:w,height:h,variant}=piece;
        box(s,0,0,w,h,9,ROSE,BRASS,1.5);box(s,5,5,w-10,h-15,6,'#eadccc','#c4ac91',.8);
        s.stroke([['move',12,15],['line',w-23,35]],'rgba(157,105,110,.2)',.8);
        screen(s,22,12,32,20,2);box(s,26,32,24,8,1,'#68615c');box(s,w-40,18,17,25,3,'#35353a',BRASS);s.fill(rect(w-37,22,11,7),'#8aa8a3');dot(s,w/2,22,8,'#bfa470',BRASS);dot(s,w/2,22,5,'#4f6845');
        caption(s,variant?look.label_alt:look.label,w/2,h-5,8);
    });}},
    fern_planter:{draw(art,piece,look){art.still(s=>{                    // nine fronds fanned from a brass pot
        const {width:w,height:h}=piece,m=Math.min(w,h),rx=w*.24;
        dot(s,w/2,h/2,m*.43,'#a78a51',BRASS);dot(s,w/2,h/2,m*.34,'#3a3525');
        for(let i=0;i<9;i++){const a=i*TAU/9;
            s.enter({position:[w/2+Math.cos(a)*rx*.35,h/2+Math.sin(a)*rx*.35],rotation:a});
            s.fill([ellipse(rx*.45,0,rx,.18*w)],i%2?look.leaf:look.leaf_light);s.stroke([['move',0,0],['line',rx*1.3,0]],'rgba(163,186,126,.35)',.8);
            s.leave();}
    });}},
    brass_balustrade:{draw(art,piece,look){art.still(s=>{                // the staircase's brass rail on rose stone
        const {width:w,height:h}=piece,v=h>w;
        box(s,0,0,w,h,3,look.stone,BRASS,1.2);
        s.fill(v?rect(w/2-1,2,2,h-4):rect(2,h/2-1,w-4,2),BRIGHT);
        for(let k=8;k<(v?h:w)-4;k+=12)v?dot(s,w/2,k,2.2,'#d8bd84'):dot(s,k,h/2,2.2,'#d8bd84');
    });}},
    newel_post:{draw(art,piece,look){art.still(s=>{                      // a newel post with a frosted globe lamp
        const {width:w,height:h}=piece;
        box(s,0,0,w,h,4,'#6a3a4a',BRASS,1.5);box(s,4,4,w-8,h-8,3,'#8a5362');
        dot(s,w/2,h/2,w*.3,'#f6ead0',BRASS);dot(s,w/2,h/2,w*.16,'#fff8e6');
    });}},
    perfume_counter:{draw(art,piece,look){art.still(s=>{                 // a round glass counter of perfume bottles
        const {width:w,height:h}=piece,colors=look.bottles;
        dot(s,w/2,h/2,w/2,ROSE,BRASS);dot(s,w/2,h/2,w/2-6,'#efe2cf','#c4ac91');
        for(let i=0;i<10;i++){const a=i*Math.PI/5,R=w*.3,X=w/2+Math.cos(a)*R,Y=h/2+Math.sin(a)*R;box(s,X-4,Y-5,8,10,2,colors[i%colors.length],'#8c7457',.6);dot(s,X,Y-6,1.8,BRASS);}
        dot(s,w/2,h/2,9,'#f7f0e2',BRASS);dot(s,w/2,h/2,3.5,'#e7b6c2');
    });}},
    rose_urn:{draw(art,piece,look){art.still(s=>{                        // a tall urn of pale roses, set in a sunflower spiral
        const {width:w,height:h}=piece,colors=look.roses;
        dot(s,w/2,h/2,w*.46,'#b59a63',DARK);dot(s,w/2,h/2,w*.38,'#3e4a35');
        for(let i=0;i<14;i++){const a=i*2.39996,R=w*.32*Math.sqrt((i+.5)/14),X=w/2+Math.cos(a)*R,Y=h/2+Math.sin(a)*R;dot(s,X,Y,w*.085,colors[i%colors.length]);dot(s,X,Y,w*.03,'rgba(140,60,80,.4)');}
    });}},
    cypress_planter:{draw(art,piece,look){art.still(s=>{                 // a clipped cypress in a black planter
        const {width:w,height:h}=piece;
        box(s,0,0,w,h,4,'#232126',BRASS,1);dot(s,w/2,h/2,w*.4,'#2e4a31');dot(s,w/2,h/2,w*.28,'#3e6440');dot(s,w/2-2,h/2-2,w*.14,'#5c8a55');
    });}},
    bag_table:{draw(art,piece,look){art.still(s=>{                       // a round walnut table of handbags
        const {width:w,height:h,variant}=piece,colors=look.bags;
        dot(s,w/2,h/2,w/2,WALNUT,BRASS);dot(s,w/2,h/2,w/2-5,'#70523d');
        for(let i=0;i<4;i++){const a=i*Math.PI/2+.4,R=w*.24,X=w/2+Math.cos(a)*R,Y=h/2+Math.sin(a)*R;box(s,X-9,Y-6,18,12,3,colors[(i+variant)%colors.length],BRASS,.7);s.stroke([circle(X,Y-6,5,Math.PI,0)],BRIGHT,1);}
        dot(s,w/2,h/2,6,'#f0e2c4',BRASS);
    });}},
    dress_form:{draw(art,piece,look){art.still(s=>{                      // a dressed form on a marble plinth, seen from above
        const {width:w,height:h,variant}=piece,dress=look.dresses[variant%look.dresses.length],cx=w/2,cy=h/2,k=w/40;
        dot(s,cx,cy,w/2,'#141116',BRASS);dot(s,cx,cy,w/2-3,'#2a252c');
        const hem=[];for(let i=0;i<=24;i++){const a=i*Math.PI/12,R=(14+(i%2?1.6:0))*k;hem.push([cx+Math.cos(a)*R,cy+2*k+Math.sin(a)*R*.92]);}
        s.outlined(polygon(hem),dress,'rgba(0,0,0,.28)',.7);                      // the gown's skirt, scalloped into folds
        for(let i=0;i<12;i++){const a=i*Math.PI/6;s.stroke([['move',cx+Math.cos(a)*5*k,cy+2*k+Math.sin(a)*5*k],['line',cx+Math.cos(a)*13*k,cy+2*k+Math.sin(a)*12*k]],'rgba(255,240,215,.28)',.8);}
        s.fill([ellipse(cx,cy-k,10*k,5*k)],dress);s.stroke([ellipse(cx,cy-k,10*k,5*k)],'rgba(0,0,0,.35)',.8);   // the bodice
        dot(s,cx-10*k,cy-k,2.2*k,'#e6dccd');dot(s,cx+10*k,cy-k,2.2*k,'#e6dccd');                                  // the form's arms
        dot(s,cx,cy-1.5*k,3.4*k,'#f1e7da','#a8957a');
        if(variant%2===0)s.stroke([circle(cx,cy-k,5*k,.3,Math.PI-.3)],BRIGHT,1);                                   // a necklace
    });}},
    clothes_rail:{draw(art,piece,look){art.still(s=>{                    // a brass rail of hung clothes
        const {width:w,height:h,variant}=piece,colors=look.garments,n=Math.floor((w-12)/9);
        box(s,0,0,w,h,4,'rgba(42,35,40,.55)',BRASS,1.2);s.fill(rect(4,h/2-1,w-8,2),BRASS);
        for(let i=0;i<n;i++){const X=7+i*9;box(s,X,4,7,h-8,2,colors[(i*3+variant)%colors.length],'rgba(0,0,0,.25)',.5);s.fill(rect(X+1,5,1,h-10),'rgba(255,245,225,.18)');}
    });}},
    round_rack:{draw(art,piece,look){art.still(s=>{                      // a two-tier round rack: bronze rails on an obsidian plinth, garments hung by colour
        const {width:w,height:h,variant}=piece,cx=w/2,cy=h/2,R=w/2,pal=ROUND_RACKS[variant%ROUND_RACKS.length];
        const hash=i=>{const v=Math.sin(i*91.7+variant*13.1)*4375.5;return v-Math.floor(v);};
        dot(s,cx+2,cy+3,R,'rgba(0,0,0,.28)');dot(s,cx,cy,R,'#141116',BRASS);dot(s,cx,cy,R-3,'#1f1b20');
        s.stroke([circle(cx,cy,R-6,Math.PI*1.05,Math.PI*1.6)],'rgba(255,240,215,.08)',1);
        const tier=(rad,n,len,wid)=>{
            for(let i=0;i<n;i++){const a=i*TAU/n+.08,col=pal[Math.floor(i/n*pal.length*2)%pal.length],L=len*(.8+hash(i+rad)*.35);
                s.enter({position:[cx+Math.cos(a)*rad,cy+Math.sin(a)*rad],rotation:a});
                // seen from above a hung piece is its shoulders edge-on: wider at the shoulder, the hem falling away
                s.outlined([['move',-1.5,-wid*.5],['line',L*.3,-wid*.62],['line',L,-wid*.36],['quadratic',L+1.2,0,L,wid*.36],['line',L*.3,wid*.62],['line',-1.5,wid*.5],['close']],col,'rgba(0,0,0,.45)',.5);
                s.fill(rect(0,-wid*.4,L*.7,.7),'rgba(255,245,225,.2)');
                s.leave();}
            s.stroke([circle(cx,cy,rad)],'#4a3420',3);s.stroke([circle(cx,cy,rad)],BRASS,1.6);
            s.stroke([circle(cx,cy,rad-.6,Math.PI*1.1,Math.PI*1.7)],'rgba(240,214,160,.7)',.6);
            for(let i=0;i<n;i++){const a=i*TAU/n+.08;dot(s,cx+Math.cos(a)*rad,cy+Math.sin(a)*rad,.8,'#e8cf9c');}
        };
        tier(R*.56,Math.round(R*2*Math.PI*.56/3.6),R*.38,4.2);
        tier(R*.27,Math.round(R*2*Math.PI*.27/3.8),R*.2,3.8);
        for(let i=0;i<4;i++){const a=i*Math.PI/2+Math.PI/4;s.stroke([['move',cx+Math.cos(a)*5,cy+Math.sin(a)*5],['line',cx+Math.cos(a)*R*.27,cy+Math.sin(a)*R*.27]],BRASS,1.2);}
        dot(s,cx,cy,6,'#cdb48a','#5c4128');dot(s,cx,cy,3,'#f1dfb6');dot(s,cx-1,cy-1,1,'#fffaf0');   // the crown
    });}},
    gondola:{draw(art,piece,look){art.still(s=>gondola(s,piece,look));}},
    knit_cubbies:{draw(art,piece,look){art.still(s=>{                    // cubbies of folded knits along the wall
        const {width:w,height:h}=piece,v=h>w,n=Math.floor(((v?h:w)-12)/26),colors=look.knits;
        plinth(s,w,h,WALNUT);
        for(let i=0;i<n;i++){const X=v?5:6+i*26,Y=v?6+i*26:5,W=v?w-10:22,H=v?22:h-10;box(s,X,Y,W,H,2,'#563c2d',BRASS,.6);
            for(let k=0;k<3;k++){const c=colors[(i+k)%colors.length];v?box(s,X+3,Y+2+k*6,W-6,5,1,c):box(s,X+2+k*6,Y+3,5,H-6,1,c);}}
    });}},
    deli_counter:{draw(art,piece,look){art.still(s=>{                    // the chef's counter of prepared dishes
        const {width:w,height:h}=piece,n=Math.floor((w-20)/46);
        plinth(s,w,h,'#495458');box(s,6,6,w-12,h-18,3,'#cfd9d6');
        for(let i=0;i<n;i++){const X=12+i*46,food=DISHES[i%DISHES.length];box(s,X,12,40,h-34,3,'#f1ece2','#9aa3a0',.8);
            s.fill([ellipse(X+20,12+(h-34)/2,14,(h-34)/2-5)],food[0]);
            for(let k=0;k<4;k++)dot(s,X+12+k*5,14+(h-34)/2+(k%2?3:-3),2,food[1]);}
        s.fill(rect(8,8,w-16,4),'rgba(232,250,255,.18)');
        caption(s,look.label,w/2,h-5,8);
    });}},
    gallery_void:{draw(art,piece,look){art.still(s=>{              // looking down into the lobby: its marble far below, the rail all round
        const {width:w,height:h}=piece;
        box(s,0,0,w,h,40,radial([0,0],20,[0,0],Math.max(w,h)*.62,[[0,'#8a7768'],[.6,'#4d3a3c'],[1,'#241820']]));
        s.enter({position:[w/2,h/2]});s.clip({type:'rect',size:[w,h],radius:40});s.enter({position:[-w/2,-h/2]});
        for(let X=20;X<w;X+=46)s.stroke([['move',X,0],['line',X,h]],'rgba(30,18,22,.25)',1);
        for(let Y=20;Y<h;Y+=46)s.stroke([['move',0,Y],['line',w,Y]],'rgba(30,18,22,.25)',1);
        s.stroke([circle(w/2,h/2,Math.min(w,h)*.38)],'rgba(198,163,101,.45)',2);
        s.fill(rect(0,0,w,14),'rgba(0,0,0,.28)');s.fill(rect(0,0,14,h),'rgba(0,0,0,.28)');     // the floor's lip throws its shadow
        s.leave();s.leave();
        box(s,3,3,w-6,h-6,38,null,'#5b3341',9);box(s,3,3,w-6,h-6,38,null,BRASS,3);box(s,2,2,w-4,h-4,39,null,BRIGHT,1);
    });}},
    buttoned_ottoman:{draw(art,piece,look){art.still(s=>{                // a round buttoned ottoman
        const {width:w,height:h}=piece;
        dot(s,w/2,h/2,w/2,'#7d4b5a',BRASS);dot(s,w/2,h/2,w/2-6,look.velvet);
        for(let i=0;i<8;i++){const a=i*Math.PI/4;dot(s,w/2+Math.cos(a)*w*.25,h/2+Math.sin(a)*w*.25,1.6,'#5b3341');}
        dot(s,w/2,h/2,2.5,BRASS);
    });}},
    round_dining_table:{draw(art,piece,look){art.still(s=>{              // a round table for four, linen and candle
        const {width:w,height:h}=piece;
        for(let i=0;i<4;i++){const a=i*Math.PI/2+Math.PI/4;dot(s,w/2+Math.cos(a)*w*.38,h/2+Math.sin(a)*h*.38,w*.11,ROSE,BRASS);dot(s,w/2+Math.cos(a)*w*.38,h/2+Math.sin(a)*h*.38,w*.07,'#94586b');}
        dot(s,w/2,h/2,w*.3,'#f6efe3','#c9b597');
        for(let i=0;i<4;i++){const a=i*Math.PI/2+Math.PI/4,X=w/2+Math.cos(a)*w*.19,Y=h/2+Math.sin(a)*h*.19;dot(s,X,Y,5.5,'#fffaf0','#c8b89a');dot(s,X,Y,2.5,'#e8dcc4');}
        dot(s,w/2,h/2,4,BRASS);dot(s,w/2,h/2,1.6,'#fff1c9');
    });}},
    velvet_booth:{draw(art,piece,look){art.still(s=>{                    // a rose velvet banquette with its table for two
        const {width:w,height:h}=piece,tx=38+(w-62)/2;
        box(s,0,0,30,h,8,'#713f52',BRASS,1.2);box(s,4,4,22,h-8,6,'#94586b');
        box(s,38,8,w-62,h-16,4,'#f6efe3','#c9b597');dot(s,tx,h/2-9,5.5,'#fffaf0','#c8b89a');dot(s,tx,h/2+9,5.5,'#fffaf0','#c8b89a');dot(s,tx+10,h/2,2,BRASS);
        dot(s,w-12,h/2,11,ROSE,BRASS);dot(s,w-12,h/2,7,'#94586b');
    });}},
    patisserie_counter:{draw(art,piece,look){art.still(s=>{              // the patisserie trolley-counter
        const {width:w,height:h}=piece,n=Math.floor((w-20)/26),colors=look.cakes;
        plinth(s,w,h,WALNUT);box(s,6,6,w-12,h-16,4,'#efe2cf');
        for(let i=0;i<n;i++){const X=16+i*26,Y=6+(h-16)/2;dot(s,X,Y,9,'#fffaf2','#c9b597');dot(s,X,Y,6,colors[i%colors.length]);dot(s,X,Y-2,1.6,'#b8303e');}
        caption(s,look.label,w/2,h-4,8);
    });}},
    kitchen_range:{draw(art,piece,look){art.still(s=>{                   // a black range of burners
        const {width:w,height:h}=piece,n=Math.floor((w-10)/36);
        box(s,0,0,w,h,3,'#2c2e31','#8f9396',1.2);
        for(let i=0;i<n;i++){const X=22+i*36;dot(s,X,h/2,13,'#18191b','#5a5d60');dot(s,X,h/2,7,'#2b2d30','#6d7074');}
        s.fill(rect(4,h-6,w-8,3),'#b9bdc0');
    });}},
    kitchen_prep:{draw(art,piece,look){art.still(s=>{                    // a steel bench: a board, a row of produce, two knives
        const {width:w,height:h}=piece;
        box(s,0,0,w,h,3,'#aab0b3','#5f6467',1.2);box(s,4,4,w-8,h-8,2,'#c9ced0');
        box(s,14,12,40,26,3,'#c99a6a','#7b5a3a',.8);for(let k=0;k<5;k++)dot(s,70+k*12,h/2,4,['#b04a3a','#e2c06a','#5f8a4a','#f0e0c8','#c86a3a'][k]);
        s.fill([...rect(w-40,14,26,3),...rect(w-40,22,22,3)],'#4a4d50');
    });}},
    kitchen_fridge:{draw(art,piece,look){art.still(s=>{                  // a steel double-door fridge
        const {width:w,height:h}=piece;
        box(s,0,0,w,h,3,'#c4c9cb','#5f6467',1.2);s.fill([...rect(w/2-.5,4,1,h-8),...rect(w/2-6,h/2-8,2,16),...rect(w/2+4,h/2-8,2,16)],'#8a8f92');
    });}},
    kitchen_sink:{draw(art,piece,look){art.still(s=>{                    // a steel double sink
        const {width:w,height:h}=piece;
        box(s,0,0,w,h,3,'#b7bcbf','#5f6467',1.2);box(s,8,8,w/2-12,h-16,4,'#7d8487','#4f5558');box(s,w/2+4,8,w/2-12,h-16,4,'#7d8487','#4f5558');dot(s,w/2,6,3,'#e0e3e5','#4f5558');
    });}},
    jewel_vitrine:{draw(art,piece,look){art.still(s=>{                   // a glass vitrine of rings and necklaces on velvet
        const {width:w,height:h}=piece,n=Math.floor((w-20)/22);
        plinth(s,w,h,WALNUT);box(s,6,6,w-12,h-12,3,look.velvet);
        for(let i=0;i<n;i++){const X=16+i*22;s.stroke([circle(X,h/2-4,6,0,Math.PI)],i%2?BRIGHT:'#e0e6ec',1.2);dot(s,X,h/2+3,2.2,['#ff7aa8','#9ad8ff','#f4e2a0','#b8f0c8'][i%4]);dot(s,X,h/2+12,2.6,'#e9dcc0',BRASS);}
        s.fill(rect(7,7,w-14,3),'rgba(232,250,255,.16)');s.stroke(rect(5.5,5.5,w-11,h-11),'rgba(255,248,225,.5)',1);
    });}},
    accessory_wall:{draw(art,piece,look){art.still(s=>{                  // wall shelves: handbags, or heels in pairs
        const {width:w,height:h}=piece,v=h>w,n=Math.floor(((v?h:w)-12)/34),bags=look.goods==='bags';
        plinth(s,w,h,WALNUT);
        for(let i=0;i<n;i++){const X=v?w/2:20+i*34,Y=v?20+i*34:h/2;
            if(bags){box(s,X-10,Y-8,20,16,3,['#7b2f45','#e6d2b4','#1f1b20','#c58f6a','#d79bb1'][i%5],BRASS,.7);s.stroke([circle(X,Y-8,6,Math.PI,0)],BRIGHT,1);}
            else{const c=['#b0475f','#1c1a1f','#e9d3a6','#c9a98c','#7b3fa0'][i%5];for(const dx of [-5,5])s.fill([ellipse(X+dx,Y,3.5,10)],c);dot(s,X-5,Y+8,1.2,BRIGHT);dot(s,X+5,Y+8,1.2,BRIGHT);}}
    });}},
    heel_island:{draw(art,piece,look){art.still(s=>{                     // a low island of heels
        const {width:w,height:h,variant}=piece,n=Math.floor((w-16)/26);
        box(s,0,0,w,h,8,'#efe2cf',BRASS,1.4);
        for(let i=0;i<n;i++){const X=16+i*26,c=['#b0475f','#1c1a1f','#e9d3a6','#c58f6a','#7b3fa0'][(i+variant)%5];for(const dx of [-4,4])s.fill([ellipse(X+dx,h/2,3.2,9)],c);}
    });}},
    velvet_chaise:{draw(art,piece,look){art.still(s=>{                   // a rose velvet chaise
        const {width:w,height:h}=piece;
        box(s,0,0,w,h,14,'#713f52',BRASS,1.4);box(s,6,6,w-12,h-12,10,look.velvet);box(s,4,4,26,h-8,10,'#8a5362');
        for(let i=0;i<4;i++)dot(s,44+i*((w-56)/3),h/2,1.5,'#5b3341');
    });}},
    triple_mirror:{draw(art,piece,look){art.still(s=>{                   // a gilt three-way mirror
        const {width:w,height:h}=piece;
        for(let i=0;i<3;i++){const X=i*w/3;box(s,X+1,0,w/3-2,h,3,BRASS,DARK,.8);box(s,X+4,4,w/3-8,h-8,2,linear([-w/6,-h/2],[w/6,h/2],[[0,'#cfd8dc'],[.5,'#f4f7f8'],[1,'#9fb0b6']]));}
    });}},
    fitting_rooms:{draw(art,piece,look){art.still(s=>{                   // curtained cubicles, each with its mirror and stool, one curtain drawn back
        const {width:w,height:h}=piece,n=Math.max(1,Math.floor(w/90)),cw=w/n;
        for(let i=0;i<n;i++){const X=i*cw,open=i===1,curtain=open?'#a46a7b':'#7d4b5a';
            box(s,X+2,0,cw-4,h,3,'#e9dfd2','#b59a75',1.2);
            box(s,X+8,4,cw-16,8,2,'#cfd8dc',BRASS,.8);dot(s,X+cw/2,h*.45,8,'#a46a7b',BRASS);
            for(let k=0;k<(open?3:8);k++)box(s,X+4+k*(cw-8)/8,h-14,(cw-8)/8-1,12,2,curtain);
            s.fill(rect(X+4,h-16,cw-8,2),BRASS);}
    });}},
    snack_vending:{draw(art,piece,look){art.still(s=>{                   // the store's snack machine
        const {width:w,height:h}=piece;
        box(s,0,0,w,h,4,'#4a353d',BRASS,1.2);box(s,5,6,w-15,h-18,2,'#273032','#a4987f',.7);
        for(let i=0;i<3;i++)for(let j=0;j<3;j++)box(s,8+i*8,12+j*12,6,8,1,['#ab8260','#92705a','#bfd0b0'][(i+j)%3]);
        box(s,w-8,16,5,10,1,'#a5b6a5');s.fill(rect(w-8,31,5,3),BRASS);box(s,8,h-10,w-19,5,1,'#1b2021');
    });}}
};

const ROUND_RACKS=[['#e9dcc4','#cdb48a','#a3815a','#6e5440','#2a2428','#f4ede0'],['#16301f','#2f5a4d','#5a1a2a','#8c2b3e','#1d2a4a','#0f0e12'],['#f2d6dc','#d79bb1','#b0475f','#e9d3a6','#f4ede0','#c9a3b8'],['#0f0e12','#2a2830','#55525c','#9a98a2','#d8d6dc','#1c1a1f'],['#3a2a1f','#7a5a3a','#c58f6a','#e2c79a','#5a1a2a','#1c1a1f']];
const DISHES=[['#c86a3a','#7a9a4a'],['#e2c06a','#b04a3a'],['#8a5a3a','#d8c8a0'],['#5f8a4a','#e8d8b0'],['#c84a5a','#f0e0c8']];
const FOOD_FACES=[['box','jar'],['bottle','box'],['produce','produce'],['jar','bottle']],CLOTH_FACES=[['fold','fold'],['hang','hang'],['fold','hang']];
const FOOD_SIGNS=['PANTRY','CELLAR & OILS','THE GREENGROCER','PRESERVES'],CLOTH_SIGNS=['KNITWEAR','EVENING','DENIM & SHIRTS'];
const SIGN_FONT={family:'Georgia, serif',size:7};

/**
 * An aisle gondola: an obsidian run with bronze price rails, goods seen from above on both faces, a
 * featured stack on each end cap and its sign hung over the middle. Laid out along its long side.
 */
function gondola(s,piece,look){
    const {width:w,height:h,variant,seed:[x]}=piece,v=h>w,L=v?h:w,D=v?w:h,food=look.goods==='food';
    const hash=i=>{const k=Math.sin(i*127.1+variant*311.7+x*.13)*43758.5;return k-Math.floor(k);};
    s.enter(v?{position:[w,0],rotation:Math.PI/2}:{});
    box(s,2,3,L,D,4,'rgba(0,0,0,.3)');box(s,0,0,L,D,4,'#161317','#5c4128',1);
    const cap=Math.min(26,D*.62),half=(D-3)/2-4,run=L-2*cap;
    box(s,1,1,L-2,D-2,3,null,BRASS,1.2);
    s.fill(rect(cap,D/2-1.5,run,3),'#0d0b0e');s.fill(rect(cap,D/2-.4,run,.8),'rgba(201,154,91,.5)');   // the spine
    const kinds=food?FOOD_FACES[variant%4]:CLOTH_FACES[variant%3];
    if(kinds[0]==='hang'&&kinds[1]==='hang')s.fill(rect(cap,D/2-2,run,4),'rgba(0,0,0,.35)');
    goods(s,true,kinds[0],variant*17+1,{cap,L,D,H:half,hash});goods(s,false,kinds[1],variant*17+40,{cap,L,D,H:half,hash});
    if(kinds.includes('hang')){s.fill(rect(cap,D/2-1,run,2),BRASS);s.fill(rect(cap,D/2-1,run,.6),'rgba(255,238,200,.6)');}
    for(const ex of [0,L-cap]){                                                            // a featured stack each end, on champagne stone
        box(s,ex+2,2,cap-4,D-4,3,'#8d795d',BRASS,1);box(s,ex+5,5,cap-10,D-10,2,'#a48e6c');
        const ccx=ex+cap/2,ccy=D/2;
        if(food){const col=[['#e8994e','#d5aa40'],['#6a2a3a','#2f4a2f'],['#b74840','#85a84e'],['#d6ac6c','#a36b42']][variant%4];for(let q=0;q<7;q++){const a=q*TAU/6;dot(s,q?ccx+Math.cos(a)*4.6:ccx,q?ccy+Math.sin(a)*4.6:ccy,2.6,col[q%2],'rgba(0,0,0,.35)');}}
        else for(let q=0;q<3;q++)box(s,ccx-6+q*.6,ccy-7+q*4.4,12,5,1,['#e9dcc4','#2a2428','#cdb48a','#5a1a2a'][(q+variant)%4],'rgba(0,0,0,.3)',.5);
    }
    s.leave();
    // the hanging sign over the aisle: an obsidian plate on bronze, its shadow on the goods
    const label=look.label||(food?FOOD_SIGNS[variant%4]:CLOTH_SIGNS[variant%3]);
    const sx=v?w/2:look.sign_at*w,sy=v?look.sign_at*h:h/2,tw=piece.measure(label,SIGN_FONT).width+16;
    box(s,sx-tw/2+4,sy,tw,13,2,'rgba(0,0,0,.28)');box(s,sx-tw/2,sy-7,tw,13,2,'#141116',BRASS,1);
    s.text((look.aisle?look.aisle+'  •  ':'')+label,sx,sy,{font:SIGN_FONT,align:'center',baseline:'middle'},{fill:'#d9bf8c'});
}

/** One face of a gondola: goods in a row from cap to cap, `top` the north face (their fronts at its outer edge). */
function goods(s,top,kind,seed,{cap,L,D,H,hash}){
    const Y0=top?3:D/2+1.5,run=L-2*cap-4;let X=cap+2,i=0;
    s.enter();s.clip(rect(cap+1,Y0,run+2,H+1));
    while(X<cap+2+run){const k=hash(seed+i*7.3),k2=hash(seed+i*3.1+9);
        if(kind==='box'){const bw=7+k*7,col=['#b0475f','#e9d3a6','#2f5a4d','#c58f6a','#1d2a4a','#f3ece0','#8a5a2a','#d5aa40'][(seed+i)%8];
            for(let t=0;t<2;t++){box(s,X,Y0+1+t*(H/2),bw-1,H/2-1.5,.8,col,'rgba(0,0,0,.35)',.5);s.fill(rect(X+1.5,Y0+2.5+t*(H/2),bw-4,1.6),'rgba(255,250,235,.45)');}X+=bw;}
        else if(kind==='jar'){const R=2.6+k*1.4,col=['#c84a3a','#d5aa40','#7a4a2a','#e8994e','#6a8a3a','#a03a5a'][(seed+i)%6];
            for(let t=0;t<Math.max(1,Math.floor(H/(R*2+1)));t++){const yy=Y0+R+1+t*(R*2+1);dot(s,X+R,yy,R,col,'rgba(0,0,0,.4)');dot(s,X+R,yy,R*.62,['#c6a365','#e8e0d0','#2a2428'][(seed+i)%3]);dot(s,X+R-.8,yy-.8,.6,'rgba(255,255,255,.6)');}X+=R*2+1;}
        else if(kind==='bottle'){const col=['#3c2a3a','#2f4a2f','#6a3a2a','#c9b06a','#1f2a3a'][(seed+i)%5];
            for(let t=0;t<Math.max(1,Math.floor(H/7.5));t++){const yy=Y0+4+t*7.5;dot(s,X+3.2,yy,3.2,col,'rgba(0,0,0,.4)');dot(s,X+3.2,yy,1.2,'#c6a365');}X+=7;}
        else if(kind==='produce'){const bw=18+k*6,col=['#b74840','#d5aa40','#85a84e','#e8994e','#6b3a6a','#c8d86a'][(seed+i)%6];
            box(s,X,Y0+1,bw-2,H-1,1.5,'#4a3424','#8a6844',.6);for(let q=0;q<bw*H/22;q++){const fx=X+3+hash(seed+i*5+q)*(bw-8),fy=Y0+3.5+hash(seed+i*9+q*2)*(H-6);dot(s,fx,fy,2.4,col);dot(s,fx-.7,fy-.7,.6,'rgba(255,250,210,.4)');}X+=bw;}
        else if(kind==='fold'){const bw=13,col=FOLDS[Math.floor(i/2+seed)%10],creases=[];
            box(s,X,Y0+1.5,bw-2,H-2,1.2,col,'rgba(0,0,0,.35)',.5);for(let f=1;f<4;f++)creases.push(...rect(X+1,Y0+1.5+f*(H-2)/4,bw-4,.7));s.fill(creases,'rgba(0,0,0,.16)');s.fill(rect(X+1,Y0+2,1,H-4),'rgba(255,250,235,.2)');X+=bw;}
        else if(kind==='hang'){const col=HANGS[Math.floor(i/3+seed)%10],Lg=H*(.82+k2*.2),y0=top?Y0+H:Y0,dir=top?-1:1;
            s.outlined([['move',X,y0],['line',X+5,y0],['line',X+5.6,y0+dir*Lg*.7],['quadratic',X+2.5,y0+dir*Lg,X-.6,y0+dir*Lg*.7],['close']],col,'rgba(0,0,0,.4)',.5);X+=4.2;}
        i++;}
    s.leave();
    // the face's bronze price rail at its outer edge, a champagne tag every so often
    const ry=top?1.5:D-3;s.fill(rect(cap,ry,L-2*cap,1.5),BRASS);
    if(kind!=='hang')for(let t=cap+10;t<L-cap-6;t+=26)s.fill(rect(t,top?ry-.5:ry,5,2.5),'#ead5a6');
}
const FOLDS=['#f3ece0','#e9d3a6','#cdb48a','#a3815a','#6e5440','#3a3540','#1c1a1f','#5a1a2a','#2f5a4d','#1d2a4a'];
const HANGS=['#e9dcc4','#cdb48a','#a3815a','#2a2428','#5a1a2a','#8c2b3e','#2f5a4d','#1d2a4a','#f2d6dc','#16141a'];
