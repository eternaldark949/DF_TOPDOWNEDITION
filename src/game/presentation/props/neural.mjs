// Neural Systems' furniture families (ns_*): a sapphire-crystal department store, its vitrines,
// polished facets and private styling suites. Drawn on the art toolkit as the other venues' are.
// Each piece lies on its own soft drop shadow, as the store's classic art drew it.
import {rect,circle,ellipse,polygon,radial} from '../../../engine/basement/rendering/index.mjs';
import {box} from './draw.mjs';

const TAU=Math.PI*2,FACETS=['#28588a','#15345b','#0b1b3c','#1b4374','#456d9b'],PALE='#e5e6df',METAL='#9baebe';
/** The drop shadow under each piece, 3 right and 4 down. */
const drop=(s,w,h,r)=>box(s,3,4,w,h,r,'rgba(0,0,0,.3)');
/** A six-sided sapphire slab: facets to its heart, a pale rim, one glint across. */
function crystal(s,w,h,base){
    const pts=[[w*.18,0],[w*.82,0],[w,h*.24],[w*.82,h],[w*.18,h],[0,h*.24]],cx=w*.5,cy=h*.48,colors=[base,...FACETS];
    for(let i=0;i<6;i++)s.fill(polygon([pts[i],pts[(i+1)%6],[cx,cy]]),colors[i]);
    s.stroke(polygon(pts),'rgba(181,216,243,.6)',.8);
    s.stroke([['move',w*.18,1],['line',cx,cy],['line',w*.82,h-1]],'rgba(232,245,255,.3)',.8);
}
/** The store's seal: a cut gem outline, its table and girdle. */
function seal(s,x,y,r,color){
    s.enter({position:[x,y]});const lw=Math.max(.7,r*.022);
    s.stroke(polygon([[0,-r],[r*.7,-r*.35],[r*.52,r*.55],[0,r],[-r*.52,r*.55],[-r*.7,-r*.35]]),color,lw);
    s.stroke([...polygon([[0,-r],[r*.3,0],[0,r],[-r*.3,0]]),['move',-r*.7,-r*.35],['line',r*.7,-r*.35],['move',-r*.52,r*.55],['line',r*.52,r*.55]],color,lw);
    s.leave();
}
const STATIONS={wig:'W.I.G.',skin:'S.K.I.N.',vocal:'V.O.C.A.L.',chroma:'CHROMA'};

export const NEURAL_ARTISTS={
    sapphire_counter:{pad:12,draw(art,piece,look){art.still(s=>{         // the sapphire counter: a vein of light, the seal, a card
        const {width:w,height:h}=piece;
        drop(s,w,h,5);crystal(s,w,h,look.crystal);
        s.stroke([['move',12,h*.7],['cubic',w*.3,3,w*.6,h,w-12,5]],'rgba(208,219,226,.3)',.7);
        seal(s,w/2,h/2,9,look.seal);
        s.fill(rect(w-30,7,14,9),look.card);
    });}},
    styling_console:{pad:12,draw(art,piece,look){art.still(s=>{          // a styling station: a glass screen, its subject, swatches, its name
        const {width:w,height:h}=piece,mid=w/2,st=look.station;
        drop(s,w,h,5);crystal(s,w,h,look.crystal);
        box(s,7,7,w-14,h-23,1,'rgba(166,203,232,.13)','#adc4d4',.7);
        s.fill(polygon([[9,9],[18,9],[w-10,h-26],[w-20,h-26]]),'rgba(229,244,255,.2)');
        if(st==='vocal'){const wave=[];for(let i=0;i<33;i++)wave.push([i?'line':'move',12+i*(w-24)/32,29+Math.sin(i*.55)*Math.sin(i*Math.PI/32)*12]);s.stroke(wave,'#a8d6f7',1.4);}
        else{
            s.fill([ellipse(mid,29,11,13)],st==='skin'?'#bba5a5':'#0b1529');
            s.stroke([circle(mid,27,13,Math.PI,TAU)],st==='skin'?'#ebd0c2':'#92b8dc',2);
            s.fill([ellipse(mid,45,16,5)],'#5882a6');
        }
        ['#adc7df','#c9ac94','#79649d','#56888b'].forEach((c,i)=>s.fill([circle(15+i*10,h-24,2.3)],c));
        s.text(STATIONS[st],mid,h-10,{font:{family:'Georgia,serif',size:6},align:'center',baseline:'middle'},{fill:PALE});
    });}},
    styling_pod:{pad:12,draw(art,piece,look){art.still(s=>{              // a private styling pod: the chair in its shell, two light rails
        const {width:w,height:h}=piece;
        drop(s,w,h,5);crystal(s,w,h,look.crystal);box(s,6,5,w-12,h-10,17,'#0a172a','#668cac');
        box(s,w*.28,13,w*.44,h-25,12,'#314e75','#89a0b6');
        box(s,w*.32,16,w*.36,15,6,'#8297ae','#b9c5ce');
        for(const xx of [8,w-13]){box(s,xx,23,5,h-41,2,'#b5c4cf');s.fill(rect(xx+1,29,3,h-53),look.light);}
    });}},
    server_rack:{pad:12,draw(art,piece,look){art.still(s=>{              // a server cabinet: its blades, in rows
        const {width:w,height:h}=piece;
        drop(s,w,h,5);box(s,0,0,w,h,4,look.cabinet,METAL);box(s,4,5,w-8,h-10,3,'#081321','#365572');
        for(let yy=11;yy<h-6;yy+=21){box(s,7,yy,w-14,15,1,'#274565','#809ab1',.6);s.fill(rect(10,yy+3,w-20,4),'#b9b7c7');s.fill(rect(10,yy+8,w-20,4),'#506d93');}
    });}},
    fitting_table:{pad:12,draw(art,piece,look){art.still(s=>{            // a sapphire table: three folded garments laid out under glass
        const {width:w,height:h}=piece;
        drop(s,w,h,5);crystal(s,w,h,look.crystal);
        box(s,6,6,w-12,h-12,2,'rgba(165,195,224,.14)','#b7cad8',.6);
        for(let i=0;i<3;i++){const xx=12+i*(w-20)/3;box(s,xx,13,(w-32)/3,h-30,2,look.garments[i%look.garments.length]);s.stroke(rect(xx+2,17,(w-44)/3,h-38),'rgba(238,236,229,.45)',.6);}
    });}},
    sapphire_sofa:{pad:12,draw(art,piece,look){art.still(s=>{            // a sapphire velvet sofa, channel-tufted, steel arms
        const {width:w,height:h}=piece;
        drop(s,w,h,5);box(s,0,0,w,h,9,look.frame,METAL);box(s,8,7,w-16,h-13,6,look.seat,'#536e8b');
        const ch=[];for(let xx=12;xx<w-9;xx+=12)ch.push(['move',xx,9],['line',xx,h-9]);s.stroke(ch,'#3d5b7f',.6);
        box(s,2,3,8,h-6,4,look.arms,'#9aabba');box(s,w-10,3,8,h-6,4,look.arms,'#9aabba');
    });}},
    crystal_tree:{pad:12,draw(art,piece,look){art.still(s=>{             // a violet crystal trunk (its glowing canopy is the room's glow pass)
        const {width:w,height:h}=piece,cx=w/2,cy=h/2;
        drop(s,w,h,5);
        s.outlined([circle(cx,cy,w/2)],radial([cx-3,cy-3],1,[cx,cy],w/2,[[0,look.crystal[0]],[.5,look.crystal[1%look.crystal.length]],[1,look.crystal[2%look.crystal.length]]]),look.ring,1);
    });}},
    sapphire_planter:{pad:12,draw(art,piece,look){art.still(s=>{         // a gold-rimmed planter: twelve leaves in a ring
        const {width:w,height:h}=piece;
        drop(s,w,h,5);box(s,0,0,w,h,6,look.planter,look.rim);box(s,4,4,w-8,h-8,3,look.soil);
        for(let i=0;i<12;i++){const a=i*TAU/12;s.fill([ellipse(w/2+Math.cos(a)*8,h/2+Math.sin(a)*8,9,3,a)],look.leaves[i%2?0:1%look.leaves.length]);}
    });}}
};
