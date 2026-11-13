// The apartment's furniture families (apt_949, and the pieces the hotel and the House of Death borrow
// from it), drawn on the art toolkit. As the cafe's: each artist draws one piece from its top-left
// corner (0, 0) to (width, height) in the look its family declares in the prop catalog
// (game-assets/props.json); still parts go in `art.still`, parts that move with `piece.time` in
// `art.live`, in drawing order. The table lamps, the floor lamps and the island's pendants wear the
// lamp library's fixtures, unlit (their light is drawn after the darkness).
import {rect,circle,ellipse,polyline,linear} from '../../../engine/basement/rendering/index.mjs';
import {box,disc,lines} from './draw.mjs';
import {SHADES,fabricShade,brassPendant,fixtureAt} from './fixtures.mjs';

/** Where the bar island's pendants hang along it (the lighting hangs its lights there too). */
export const ISLAND_PENDANTS=[.17,.5,.83];
const TAU=Math.PI*2;
/** One fill of many boxes from their top-left corners (the classic art's run of fillRects). */
const rects=list=>list.flatMap(([x,y,w,h])=>rect(x,y,w,h));
/** Draws `fn` with round line ends. */
const rounded=(s,fn)=>{s.enter({},{line_cap:'round'});fn();s.leave();};

/** Cream quartz veined across, with a walnut front edge along the north side. */
function counterTop(s,w,h,look){
    box(s,0,0,w,h,2,look.top);
    const veins=[];for(let i=0;i<w;i+=23)veins.push(['move',i,4],['quadratic',i+9,h*.5,i+4,h-3]);
    s.stroke(veins,look.vein,.7);
    s.fill(rect(0,0,w,3),look.edge);
}

export const APARTMENT_ARTISTS={
    workbench:{draw(art,piece,look){
        const {width:w,height:h}=piece,tx=w*.44,ty=11,tw=w*.3,th=h*.42;
        art.still(s=>{
            for(const [lx,ly] of [[1,1],[w-5,1],[1,h-5],[w-5,h-5]])box(s,lx,ly,4,4,1,'#5a5e6a');
            box(s,0,0,w,h,3,look.top,look.top_edge,1);
            const grain=[];for(let gy=11;gy<h-3;gy+=4.5)grain.push(['move',2,gy],['cubic',w*.3,gy-1.2,w*.6,gy+1.2,w-2,gy]);
            s.stroke(grain,'rgba(0,0,0,0.22)',.6);
            s.fill(rect(2,9,w-4,2),'rgba(255,220,180,0.08)');
            box(s,0,h-3,w,3,1,look.steel);s.fill(rect(1,h-3,w-2,.8),'rgba(255,255,255,0.35)');   // the steel edge band
            box(s,-1,-1,w+2,8,1.5,'#2c2a34','#4a4656',.8);                  // the pegboard lip along the back, tools hung on it
            const holes=[];for(let px=3;px<w-1;px+=4)for(const py of [1.5,4.5])holes.push([px,py,1,1]);
            s.fill(rects(holes),'rgba(0,0,0,0.6)');
            rounded(s,()=>{
                lines(s,[[6,1,6,6],[12,1,14,6],[16,1,14,6]],'#b8bcc8',1.3);   // a screwdriver, pliers
                s.fill(rect(5,5,2,2.5),'#7a2e3c');
                disc(s,21,2.5,1.8,null,'#b8bcc8',1);lines(s,[[21,4,21,7]],'#b8bcc8',1);   // a wrench
            });
            box(s,3,h-13,11,9,1.5,'#4a5060','#2a2e38',.8);                  // the vise on the front-left corner
            box(s,5,h-16,7,4,1,'#6a7080');s.fill(rect(1,h-9,15,1.2),'#c9ccd6');
            box(s,tx-1,ty-1,tw+2,th+2,2,'#15101e');box(s,tx,ty,tw,th,1.5,look.screen);   // the holo-schematic tablet
            s.stroke([...rect(tx+2,ty+2,tw*.45,th*.5),circle(tx+tw*.72,ty+th*.35,th*.2),['move',tx+2,ty+th-3],['line',tx+tw-2,ty+th-3],['move',tx+tw*.25,ty+th*.5+2],['line',tx+tw*.25,ty+th-3]],look.schematic,.6);
        });
        art.live(s=>s.fill(rect(tx+.5,ty+((piece.time*6)%th),tw-1,.8),'rgba(232,210,255,0.55)'));   // a scanline drifting down it
        art.still(s=>{
            box(s,17,h-13,12,8,1,'#3a3844','#5a5866',.6);                   // the parts tray
            for(let i=0;i<6;i++)disc(s,19.5+(i%3)*3.5,h-11+(i/3|0)*3.5,.9,i%2?'#c9a46a':'#9aa0b0');
            for(const r of [4,2.8,1.6])s.stroke([circle(w-9,16,r)],'#c47a4a',.9);   // a coil of copper wire
            disc(s,w-10,h-9,3.5,'#2a2a30','#5a5e6a',.8);                    // the soldering iron in its stand
            rounded(s,()=>{lines(s,[[w-10,h-9,w-24,h-13]],'#1a1a1e',2.2);lines(s,[[w-24,h-13,w-29,h-14.5]],'#a0a4b0',1);});
        });
        art.live(s=>disc(s,w-29,h-14.5,1.2,`rgba(255,${140+60*Math.sin(piece.time*7)|0},70,1)`));   // its tip, an ember
    }},
    velvet_sofa:{draw(art,piece,look){art.still(s=>{                     // faces north: the back along the bottom edge
        const {width:w,height:h}=piece;
        box(s,0,0,w,h,10,look.upholstery);
        box(s,2,h-20,w-4,18,8,look.upholstery_dark);
        box(s,0,4,16,h-6,7,look.upholstery_dark);box(s,w-16,4,16,h-6,7,look.upholstery_dark);   // the arms
        box(s,17,6,(w-36)/2-1,h-28,6,look.upholstery_light);box(s,w/2+1,6,(w-36)/2-1,h-28,6,look.upholstery_light);
        box(s,20,h-30,22,13,5,look.cushions[0]);box(s,w-44,h-31,22,14,5,look.cushions[1%look.cushions.length]);
        s.enter({},{opacity:.92});                                       // a knit throw over one arm
        box(s,w-30,2,26,h-10,4,look.throw);
        const knit=[];for(let i=0;i<4;i++)knit.push([w-26+i*6,5,w-26+i*6,h-12]);lines(s,knit,'rgba(150,120,100,0.35)',1);
        s.leave();
    });}},
    glass_fireplace:{pad:10,draw(art,piece,look){
        const {width:w,height:h}=piece;
        art.still(s=>{box(s,-6,-4,w+12,h+8,3,look.surround,look.surround_edge,1);box(s,0,3,w,h-6,2,look.firebox);});
        art.live(s=>{for(let i=0;i<6;i++){                               // the flames along the glass
            const fl=.6+.4*Math.sin(piece.time*7+i*1.9);
            s.fill([ellipse(5+i*(w-10)/5,h/2,3.5,(h-10)/2*fl)],`rgba(255,${140+60*fl|0},60,${.55+.35*fl})`);
        }});
    }},
    lamp_table:{draw(art,piece,look){art.still(s=>{
        const {width:w,height:h}=piece;
        box(s,0,0,w,h,5,look.wood,look.wood_edge,1);
        fixtureAt(s,w*.42,h*.45,Math.min(w,h)*.3/9,s=>fabricShade(s,SHADES.shade_table));
        if(look.pull)s.fill(rect(w/2-3,h-3,6,1.5),look.pull_color);     // a nightstand's drawer pull
    });}},
    oval_coffee_table:{draw(art,piece,look){art.still(s=>{
        const {width:w,height:h}=piece;
        box(s,0,0,w,h,h/2,look.wood,look.wood_edge,1);box(s,5,4,w-10,h-8,(h-8)/2,'rgba(255,240,230,0.08)');
        box(s,8,8,16,11,1,look.books[0]);box(s,10,10,16,11,1,look.books[1%look.books.length]);   // books
        disc(s,w-16,h/2,5,look.vase);                                    // a vase of flowers
        for(let i=0;i<5;i++)disc(s,w-16+Math.cos(i*1.26)*4,h/2+Math.sin(i*1.26)*4,2.2,look.flowers[(i+1)%look.flowers.length]);
    });}},
    slipper_chair:{draw(art,piece,look){art.still(s=>{
        const {width:w,height:h}=piece;
        box(s,0,0,w,h,12,look.fabric);box(s,5,5,w-10,h-14,9,look.seat);box(s,3,h-10,w-6,8,4,look.back);
    });}},
    open_bookshelf:{draw(art,piece,look){art.still(s=>{
        const {width:w,height:h}=piece,cols=look.spines;
        box(s,0,0,w,h,2,look.case);
        let bx=3,i=0;
        while(bx<w-4){
            const bw=3+((i*7)%4);if((i%9)===5){bx+=8;i++;continue;}       // gaps for ornaments
            s.fill(rect(bx,3,bw,h-6),cols[(i*5)%cols.length]);bx+=bw+.6;i++;
        }
        disc(s,w-14,h/2,6,look.ornament);
    });}},
    media_console:{draw(art,piece,look){
        const {width:w,height:h}=piece,cx=w/2-6,cy=h/2;
        art.still(s=>{
            box(s,0,0,w,h,2,look.wood,look.wood_edge,1);
            s.fill(rects([[6,4,26,h-8],[w-32,4,26,h-8]]),look.speakers);  // speakers, their grilles
            const grille=[];for(let i=0;i<4;i++)grille.push([8,6+i*3.5,22,1],[w-30,6+i*3.5,22,1]);s.fill(rects(grille),'rgba(255,255,255,0.08)');
            disc(s,cx,cy,9,look.record);disc(s,cx,cy,3,look.label);       // the turntable
        });
        art.live(s=>s.stroke([circle(cx,cy,6,piece.time*3.5,piece.time*3.5+1.2)],'rgba(255,255,255,0.12)',1));   // the record's sheen turns
        art.still(s=>lines(s,[[cx+14,cy-7,cx+5,cy+2]],look.arm,1.2));
    }},
    leafy_plant:{loop:{period:2*Math.PI/.8,frames:10},draw(art,piece,look){art.still(s=>{
        const cx=piece.width/2,cy=piece.height/2,r=Math.min(piece.width,piece.height)/2;
        disc(s,cx,cy,r*.6,look.pot,look.pot_edge,1);
        for(let i=0;i<7;i++){
            const a=i*.9+(piece.seed[0]%7),sway=Math.sin(piece.time*.8+i)*.05;
            s.fill([ellipse(cx+Math.cos(a)*r*.55,cy+Math.sin(a)*r*.55,r*.55,r*.26,a+sway)],i%2?look.leaf:look.leaf_light);
        }
    });}},
    floor_lamp:{draw(art,piece,look){art.still(s=>fixtureAt(s,piece.width/2,piece.height/2,piece.width/26,s=>fabricShade(s,SHADES[look.shade])));}},
    panel_fridge:{draw(art,piece,look){art.still(s=>{
        const {width:w,height:h}=piece;
        box(s,0,0,w,h,2,look.body);box(s,2,2,w-4,h-4,1.5,look.door);
        s.fill(rect(4,3,w-8,1.6),look.trim);s.fill(rect(w/2-.5,4,1,h-8),'rgba(0,0,0,0.25)');
    });}},
    kitchen_counter:{draw(art,piece,look){art.still(s=>{
        const {width:w,height:h}=piece;
        counterTop(s,w,h,look);
        if(look.fitting==='sink'){
            box(s,w/2-26,8,52,h-14,5,'#b9b4b0');box(s,w/2-23,10,46,h-18,4,'#8f8a87');
            s.stroke([circle(w/2,h-4,7,Math.PI,TAU)],look.brass,2);       // the arched tap
        }else if(look.fitting==='induction'){                            // black glass, four zones
            box(s,3,5,w-6,h-8,3,'#141012','rgba(255,255,255,0.12)',1);
            for(const [u,v,r] of [[.3,.4,7],[.72,.4,5.5],[.3,.78,5],[.72,.78,6.5]])disc(s,w*u,(h-3)*v+2,r,null,'rgba(255,255,255,0.22)',1);
        }
    });}},
    gas_range:{draw(art,piece,look){art.still(s=>{                      // five burners in black steel, brass knobs
        const {width:w,height:h}=piece;
        box(s,0,0,w,h,2,look.body,look.body_edge,1);
        [[.2,.35],[.5,.35],[.8,.35],[.3,.72],[.7,.72]].forEach(([u,v],i)=>{
            const cx=w*u,cy=h*v,r=i===1?7:5.5;
            disc(s,cx,cy,r,look.burner,look.grate,1.2);lines(s,[[cx-r,cy,cx+r,cy],[cx,cy-r,cx,cy+r]],look.grate,1);
        });
        for(let i=0;i<5;i++)disc(s,10+i*(w-20)/4,4,2,look.knobs);
    });}},
    bar_island:{draw(art,piece,look){art.still(s=>{                     // an open bar: quartz top, waterfall ends, pendants above
        const {width:w,height:h}=piece;
        counterTop(s,w,h,look);
        s.fill(rects([[0,0,6,h],[w-6,0,6,h]]),look.waterfall);s.fill(rect(6,h-4,w-12,4),look.edge);
        for(const u of ISLAND_PENDANTS)fixtureAt(s,w*u,h/2,1,brassPendant);
        box(s,w*.62,8,14,9,2,look.bowl);disc(s,w*.4,12,4,look.glass);     // a fruit bowl, a glass
    });}},
    clothing_dyer:{draw(art,piece,look){art.still(s=>{                  // a walnut cabinet: dye vats, a bolt of cloth, a swatch fan, the steamer
        const {width:w,height:h}=piece;
        box(s,0,0,w,h,3,look.cabinet,look.cabinet_edge,1);s.fill(rect(2,2,w-4,2),'rgba(255,220,180,0.08)');
        box(s,0,h-3,w,3,1,look.trim);
        look.dyes.slice(0,3).forEach((col,i)=>{const vx=8+i*11;disc(s,vx,h/2,5,'#1a1416','#b8bcc8',.9);disc(s,vx,h/2,3.7,col);disc(s,vx-1.2,h/2-1.2,1,'rgba(255,255,255,0.45)');});
        box(s,37,4,9,h-8,2,look.cloth,look.cloth_edge,.6);               // the bolt of cloth, rolled
        const turns=[];for(let yy=7;yy<h-5;yy+=3)turns.push([38,yy,45,yy]);lines(s,turns,'rgba(122,46,60,0.5)',.5);
        s.enter({position:[w-6,h-7]});for(const col of look.swatches){s.place({rotation:.28});box(s,-1,-9,2.6,9,.8,col);}s.leave();
        disc(s,w-6,6,2.6,'#d8cbbd','#8a8e9a',.6);                       // the steamer's head
    });}},
    bar_cart:{draw(art,piece,look){art.still(s=>{                       // brass and smoked glass on two wheels
        const {width:w,height:h}=piece,b=look.bottles;
        disc(s,3,2,3.2,look.wheels,look.frame,.8);disc(s,3,h-2,3.2,look.wheels,look.frame,.8);
        rounded(s,()=>s.stroke([['move',w-3,2],['quadratic',w+5,h/2,w-3,h-2]],look.frame,1.6));   // the handle
        box(s,0,0,w,h,3,look.tray,look.frame,1.4);s.fill(rect(2,2,w-4,2.5),'rgba(255,240,220,0.08)');
        const bottle=(bx,by,liq)=>{disc(s,bx,by,3.4,'#14100f','rgba(255,255,255,0.18)',.6);disc(s,bx,by,2.3,liq);disc(s,bx,by,1.2,'#c8a27a');disc(s,bx-1.1,by-1.1,.6,'rgba(255,255,255,0.6)');};
        bottle(7,6,b[0]);bottle(7,h-6,b[1%b.length]);bottle(14,h/2,b[2%b.length]);
        disc(s,22,7,3.6,'rgba(225,240,255,0.25)','rgba(240,250,255,0.75)',.6);disc(s,22,7,2.4,look.decanter);disc(s,22,7,1.1,'rgba(240,250,255,0.85)');   // a crystal decanter
        disc(s,23,h-7,4,'#b8bcc8','#e6e8f0',.8);disc(s,23,h-7,3,'#dfe9f2');   // the ice bucket
        s.fill(rects([[21.5,h-8.5,1.6,1.6],[23.5,h-7,1.4,1.4]]),'rgba(255,255,255,0.85)');
        for(const gy of [6,h-6])disc(s,w-8,gy,2.6,'rgba(220,240,255,0.2)','rgba(245,252,255,0.8)',.5);   // two coupes, waiting
    });}},
    bar_stool:{draw(art,piece,look){art.still(s=>{
        const {width:w,height:h}=piece;disc(s,w/2,h/2,w/2,look.ring);disc(s,w/2,h/2,w/2-2.5,look.seat);
    });}},
    queen_bed:{pad:9,draw(art,piece,look){art.still(s=>{                // the headboard against the top wall
        const {width:w,height:h}=piece;
        box(s,-2,0,w+4,h,5,look.frame);
        box(s,-4,-2,w+8,12,4,look.headboard);                            // channel-tufted
        const channels=[];for(let i=1;i<8;i++)channels.push([-4+(w+8)*i/8,-1,-4+(w+8)*i/8,9]);lines(s,channels,'rgba(90,34,48,0.35)',1);
        box(s,3,10,w-6,h-14,4,look.mattress);
        box(s,8,14,(w-22)/2,16,6,look.pillows);box(s,w/2+3,14,(w-22)/2,16,6,look.pillows);
        box(s,w/2-12,24,24,12,5,look.accent);
        box(s,3,40,w-6,h-44,4,look.duvet);s.fill(rect(3,40,w-6,6),look.sheet);   // the duvet, the sheet folded over
        s.fill(rect(1,h-26,w-2,16),look.throw);                          // a knit throw at the foot
        const knit=[];for(let i=0;i<8;i++)knit.push([6+i*(w-12)/7,h-25,6+i*(w-12)/7,h-11]);lines(s,knit,'rgba(150,120,100,0.35)',1);
    });}},
    wardrobe:{draw(art,piece,look){art.still(s=>{
        const {width:w,height:h}=piece;
        box(s,0,0,w,h,2,look.wood,look.wood_edge,1);s.fill(rect(2,h/2-.5,w-4,1),'rgba(0,0,0,0.3)');
        s.fill(rects([[4,h/2-6,1.5,5],[4,h/2+1,1.5,5]]),look.handles);
    });}},
    dressing_table:{pad:13,draw(art,piece,look){art.still(s=>{          // against the east wall: a round mirror, a stool in front
        const {width:w,height:h}=piece,mx=w-6,my=h/2;
        box(s,14,0,w-14,h,3,look.wood,look.wood_edge,1);
        disc(s,mx,my,16,look.frame);disc(s,mx,my,14,look.mirror);
        s.stroke([circle(mx-2,my-1,8,1.9,4.2)],'rgba(255,255,255,0.45)',1);   // the one crescent
        disc(s,20,12,2.5,'#e8b4b8');disc(s,22,20,2,'#c9a46a');box(s,18,h-16,8,10,2,'#f3e3ea');
        disc(s,5,h/2,8,look.stool,look.stool_edge,1);
    });}},
    oval_tub:{draw(art,piece,look){                                      // freestanding, strewn with petals
        const {width:w,height:h}=piece;
        art.still(s=>{s.fill([ellipse(w/2,h/2,w/2,h/2)],look.enamel);s.fill([ellipse(w/2,h/2,w/2-7,h/2-7)],look.water);});
        art.live(s=>s.stroke([ellipse(w/2,h/2,w/2-14+Math.sin(piece.time)*2,h/2-14)],'rgba(255,255,255,0.5)',1));   // the ripple
        art.still(s=>{
            for(let i=0;i<9;i++)s.fill([ellipse(w*(.25+((i*37)%50)/100),h*(.3+((i*23)%40)/100),2.6,1.6,i)],look.petals[i%3?0:1%look.petals.length]);
            lines(s,[[w-2,h/2,w-12,h/2]],look.spout,2.2);
        });
    }},
    double_vanity:{draw(art,piece,look){art.still(s=>{                  // a double marble vanity against the south wall
        const {width:w,height:h}=piece;
        box(s,0,0,w,h,2,look.stone,look.stone_edge,1);
        s.fill(rect(4,h-4,w-8,3),look.mirror_edge);
        for(const u of [.28,.72]){s.fill([ellipse(w*u,h*.45,18,9)],look.basins);s.fill(rect(w*u-1,h*.45+8,2,7),look.taps);}
        disc(s,w*.5,h*.4,3,'#e8b4b8');disc(s,w*.5+6,h*.55,2,'#c9a46a');
    });}},
    walk_in_shower:{draw(art,piece,look){art.still(s=>{                 // a tiled floor, a glass screen, a brass rain head
        const {width:w,height:h}=piece;
        box(s,0,0,w,h,2,look.tiles);
        const grout=[];for(let i=8;i<w;i+=8)grout.push([i,0,i,h]);for(let j=8;j<h;j+=8)grout.push([0,j,w,j]);lines(s,grout,look.grout,.6);
        s.stroke(polyline([[0,h],[0,0],[w*.65,0]]),look.glass,2);
        disc(s,w*.6,h*.6,9,look.head);disc(s,w*.6,h*.6,7,look.head_inner);
    });}},
    towel_rail:{draw(art,piece,look){art.still(s=>{
        const {width:w,height:h}=piece;
        s.fill(rects([[0,0,2,h],[w-2,0,2,h]]),look.rail);
        box(s,-1,10,w+2,26,2,look.towels[0]);box(s,-1,48,w+2,26,2,look.towels[1%look.towels.length]);
    });}},
    lounger:{draw(art,piece,look){art.still(s=>{                        // the head toward the railing (north)
        const {width:w,height:h}=piece;
        box(s,0,0,w,h,4,look.frame);box(s,2,2,w-4,h-4,4,look.cushion);box(s,3,3,w-6,16,4,look.pillow);box(s,1,h-22,w-2,14,3,look.towel);
    });}},
    bistro_set:{draw(art,piece,look){art.still(s=>{
        const cx=piece.width/2,cy=piece.height/2;
        for(const k of [-1,1])disc(s,cx+k*24,cy+2,8,look.chairs,look.trim,1);
        disc(s,cx,cy,13,look.top,look.trim,1.5);
        disc(s,cx-3,cy-2,3,look.flowers[0]);disc(s,cx+4,cy+2,2.5,look.flowers[1%look.flowers.length]);
    });}},
    telescope:{draw(art,piece,look){
        const cx=piece.width/2,cy=piece.height-8;
        art.still(s=>{const legs=[];for(let i=0;i<3;i++){const a=Math.PI/2+i*2.1;legs.push([cx,cy,cx+Math.cos(a)*9,cy+Math.sin(a)*9]);}lines(s,legs,look.tripod,1.5);});
        art.live(s=>{s.enter({position:[cx,cy],rotation:-Math.PI/2+.25*Math.sin(piece.time*.2)});box(s,-3,-3.5,26,7,3,look.tube);box(s,20,-4.5,6,9,2,look.eyepiece);s.leave();});   // sweeping the sky
    }},
    dining_set:{draw(art,piece,look){art.still(s=>{                     // a round table for six: chairs tucked in, flowers and two candles
        const cx=piece.width/2,cy=piece.height/2,R=Math.min(piece.width,piece.height)*.27,seat=i=>i*Math.PI/3+Math.PI/6;
        for(let i=0;i<6;i++){
            const a=seat(i);
            s.enter({position:[cx+Math.cos(a)*(R+13),cy+Math.sin(a)*(R+13)],rotation:a+Math.PI/2});
            box(s,-9,-8,18,17,5,look.chairs,look.chair_edge,1);box(s,-9,5,18,5,2.5,look.chair_backs);   // the seat, its back away from the table
            s.leave();
        }
        disc(s,cx+2,cy+3,R,'rgba(0,0,0,0.35)');
        disc(s,cx,cy,R,look.top,look.trim,1.5);disc(s,cx,cy,R-5,look.top_light);
        for(let k=6;k<R-5;k+=5)s.stroke([circle(cx,cy,k)],'rgba(0,0,0,0.18)',.6);
        disc(s,cx,cy,8,'#e9e3ec',look.trim,1);                         // a marble lazy susan, a posy on it
        for(let i=0;i<6;i++)disc(s,cx+Math.cos(i*1.05)*4,cy+Math.sin(i*1.05)*4,2.2,look.flowers[(i+1)%look.flowers.length]);
        disc(s,cx,cy,1.8,'#3f7a52');
        for(const k of [-1,1]){disc(s,cx+k*13,cy-k*6,2.4,look.trim);disc(s,cx+k*13,cy-k*6,1.2,'#fff1d6');}   // candlesticks
        for(let i=0;i<6;i++){const a=seat(i);disc(s,cx+Math.cos(a)*(R-9),cy+Math.sin(a)*(R-9),4,'#f4f0ea','rgba(201,164,106,0.8)',.6);}   // the places set
    });}},
    baby_grand:{draw(art,piece,look){art.still(s=>{                     // black lacquer, lid up: the gold harp and strings, keys to the south
        const {width:w,height:h}=piece;
        const body=[['move',4,h-14],['line',4,10],['quadratic',4,2,16,2],['line',w*.5,2],['cubic',w*.72,2,w*.62,h*.42,w*.86,h*.48],['quadratic',w-2,h*.54,w-2,h-14],['close']];
        s.enter({position:[2,3]});s.fill(body,'rgba(0,0,0,0.35)');s.leave();
        s.outlined(body,look.lacquer,look.lacquer_edge,1.2);
        s.enter();s.clip(body);
        s.fill(rect(10,8,w*.62,h-26),look.harp);
        const strings=[],x0=piece.seed[0];for(let sx=x0+13;sx<x0+w*.7;sx+=2.6)strings.push([sx-x0,h-18,sx-x0+(sx-x0)*.12,8]);
        lines(s,strings,look.strings,.5);   // the strings counted from where it stands, as the classic art strung them
        s.stroke([ellipse(w*.3,h*.42,9,12)],look.trim,1.4);
        s.fill(rect(0,0,w,h),linear([0,0],[w,h],[[0,'rgba(255,255,255,0.10)'],[.5,'rgba(255,255,255,0)']]));
        s.leave();
        lines(s,[[6,6,w*.8,h*.5]],'rgba(30,26,34,0.95)',2);              // the prop stick and the lid's edge
        box(s,2,h-16,w-2,12,1.5,'#1a1720',look.lacquer_edge,1);box(s,5,h-14,w-8,8,1,'#f4f1ea');   // the keyboard
        const sharps=[];for(let k=0,kx=x0+7;kx<x0+w-6;kx+=3.4,k++)if(k%7!==2&&k%7!==6)sharps.push([kx-x0,h-14,1.8,4.6]);s.fill(rects(sharps),'#141018');
        box(s,w*.3,h-3,w*.4,7,2,look.bench,look.trim,.8);
    });}},
    tufted_bench:{draw(art,piece,look){art.still(s=>{                   // at the foot of the bed, on brass legs
        const {width:w,height:h}=piece;
        for(const [lx,ly] of [[2,2],[w-4,2],[2,h-4],[w-4,h-4]])disc(s,lx+1,ly+1,1.8,look.legs);
        box(s,0,0,w,h,5,look.fabric,look.fabric_edge,1);
        for(let i=1;i<6;i++)disc(s,w*i/6,h/2,1.2,look.fabric_edge);
        box(s,w-30,2,22,h-4,3,look.throw);                               // a folded throw
    });}},
    chaise_longue:{draw(art,piece,look){art.still(s=>{                  // velvet, a bolster, an open book on a throw
        const {width:w,height:h}=piece;
        box(s,0,0,w,h,10,look.velvet,look.velvet_edge,1.2);box(s,3,4,w-6,22,8,look.back);   // the raised back end
        const seams=[];for(let ty=34;ty<h-8;ty+=14)seams.push([6,ty,w-6,ty]);lines(s,seams,'rgba(207,200,226,0.18)',1);
        box(s,5,26,w-10,8,4,look.bolster);box(s,8,h-30,w-14,18,3,look.throw);
        s.fill(rect(w/2-7,46,14,9),look.book);s.fill(rect(w/2-.5,46,1,9),look.ribbon);
    });}},
    fire_bowl:{draw(art,piece,look){                                     // a travertine ring, a bronze bowl, a bed of embers
        const cx=piece.width/2,cy=piece.height/2,R=Math.min(piece.width,piece.height)/2;
        art.still(s=>{
            disc(s,cx+2,cy+3,R,'rgba(0,0,0,0.35)');
            disc(s,cx,cy,R,look.stone,look.stone_edge,1.5);disc(s,cx,cy,R-6,look.bowl,look.trim,1.5);disc(s,cx,cy,R-10,look.bed);
            for(let i=0;i<9;i++){const d=(R-15)*((i*37%10)/10);disc(s,cx+Math.cos(i*2.4)*d,cy+Math.sin(i*2.4)*d,2.4,look.coals);}
        });
        art.live(s=>{for(let i=0;i<7;i++){
            const t=piece.time,a=i*.9+t*.4,d=(R-14)*(.2+.6*((i*.37)%1)),f=.6+.4*Math.sin(t*6+i*2.1);
            s.fill([ellipse(cx+Math.cos(a)*d,cy+Math.sin(a)*d,3.2*f+1,2.6*f+1,a)],`rgba(255,${120+90*f|0},50,${.6+.35*f})`);
        }});
    }},
    patio_sofa:{draw(art,piece,look){art.still(s=>{                     // teak and cream cushions, the back along the outer side
        const {width:w,height:h}=piece,east=piece.face==='W';             // (facing west, the back is on the east side)
        box(s,0,0,w,h,5,look.frame,look.frame_edge,1);
        box(s,east?w-9:1,1,8,h-2,3,look.back);
        box(s,east?2:10,3,w-12,h/2-4,3,look.cushions);box(s,east?2:10,h/2+1,w-12,h/2-4,3,look.cushions);
        box(s,east?w-18:9,h/2-8,9,16,3,look.pillow);
    });}},
    trough_planter:{pad:11,draw(art,piece,look){art.still(s=>{          // a stone trough, leaves trailing over its south lip
        const {width:w,height:h}=piece;
        box(s,0,0,w,h,3,look.trough,look.trough_edge,1);box(s,3,3,w-6,h-6,2,look.soil);
        for(let i=0;i<6;i++){
            const lx=6+i*(w-12)/5;
            s.fill([ellipse(lx,h/2,6,4,i)],i%2?look.leaf:look.leaf_light);
            s.fill([ellipse(lx+2,h+3,3,5,.3)],look.leaf);
        }
        disc(s,w*.3,h/2,2,look.flowers[0]);disc(s,w*.7,h/2-2,2,look.flowers[1%look.flowers.length]);
    });}}
};
