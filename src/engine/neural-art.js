// A sapphire-crystal department store: vitrines, polished facets and private styling suites.
function drawNeuralDecorProp(c,p){
    const x=p.x,y=p.y,w=p.width,h=p.height,B=NeuralArt.box,T=NEURAL;
    const metal=c.createLinearGradient(x,y,x+w,y+h);metal.addColorStop(0,'#a6bdcc');metal.addColorStop(.35,'#60768c');metal.addColorStop(.7,'#d0d9df');metal.addColorStop(1,'#52667a');
    B(c,x+3,y+4,w,h,'rgba(0,0,0,.3)',null,5);
    if(p.decorType==='ns_counter'){
        NeuralArt.crystal(c,x,y,w,h,'#27527d');
        c.strokeStyle='rgba(208,219,226,.3)';c.lineWidth=.7;c.beginPath();c.moveTo(x+12,y+h*.7);c.bezierCurveTo(x+w*.3,y+3,x+w*.6,y+h,x+w-12,y+5);c.stroke();
        NeuralArt.seal(c,x+w/2,y+h/2,9,T.pale);
        c.fillStyle='#e0ddd4';c.fillRect(x+w-30,y+7,14,9);
    }else if(p.decorType==='ns_console'){
        NeuralArt.crystal(c,x,y,w,h,'#224871');
        B(c,x+7,y+7,w-14,h-23,'rgba(166,203,232,.13)','#adc4d4',1,.7);
        c.fillStyle='rgba(229,244,255,.2)';c.beginPath();c.moveTo(x+9,y+9);c.lineTo(x+18,y+9);c.lineTo(x+w-10,y+h-26);c.lineTo(x+w-20,y+h-26);c.closePath();c.fill();
        const variant=p.decor.variant,mid=x+w/2;
        if(variant===2){c.strokeStyle='#a8d6f7';c.lineWidth=1.4;c.beginPath();for(let i=0;i<33;i++){const xx=x+12+i*(w-24)/32,yy=y+29+Math.sin(i*.55)*Math.sin(i*Math.PI/32)*12;i?c.lineTo(xx,yy):c.moveTo(xx,yy);}c.stroke();}
        else{
            c.fillStyle=variant===1?'#bba5a5':'#0b1529';c.beginPath();c.ellipse(mid,y+29,11,13,0,0,Math.PI*2);c.fill();
            c.strokeStyle=variant===1?'#ebd0c2':'#92b8dc';c.lineWidth=2;c.beginPath();c.arc(mid,y+27,13,Math.PI,Math.PI*2);c.stroke();
            c.fillStyle='#5882a6';c.beginPath();c.ellipse(mid,y+45,16,5,0,0,Math.PI*2);c.fill();
        }
        for(let i=0;i<4;i++){c.fillStyle=['#adc7df','#c9ac94','#79649d','#56888b'][i];c.beginPath();c.arc(x+15+i*10,y+h-24,2.3,0,Math.PI*2);c.fill();}
        NeuralArt.text(c,['W.I.G.','S.K.I.N.','V.O.C.A.L.','CHROMA'][variant],mid,y+h-10,6,T.pale);
    }else if(p.decorType==='ns_pod'){
        NeuralArt.crystal(c,x,y,w,h,'#254d76');B(c,x+6,y+5,w-12,h-10,'#0a172a','#668cac',17);
        B(c,x+w*.28,y+13,w*.44,h-25,'#314e75','#89a0b6',12);
        B(c,x+w*.32,y+16,w*.36,15,'#8297ae','#b9c5ce',6);
        for(const xx of [x+8,x+w-13]){B(c,xx,y+23,5,h-41,'#b5c4cf',null,2);c.fillStyle='#6daee5';c.fillRect(xx+1,y+29,3,h-53);}
    }else if(p.decorType==='ns_server'){
        B(c,x,y,w,h,'#11213a',T.metal,4);B(c,x+4,y+5,w-8,h-10,'#081321','#365572',3);
        for(let yy=y+11;yy<y+h-6;yy+=21){B(c,x+7,yy,w-14,15,'#274565','#809ab1',1,.6);c.fillStyle='#b9b7c7';c.fillRect(x+10,yy+3,w-20,4);c.fillStyle='#506d93';c.fillRect(x+10,yy+8,w-20,4);}
    }else if(p.decorType==='ns_table'){
        NeuralArt.crystal(c,x,y,w,h,'#2d527e');
        B(c,x+6,y+6,w-12,h-12,'rgba(165,195,224,.14)','#b7cad8',2,.6);
        for(let i=0;i<3;i++){
            const xx=x+12+i*(w-20)/3;
            B(c,xx,y+13,(w-32)/3,h-30,['#a8a9bf','#527394','#d1c6b8'][i],null,2);
            c.strokeStyle='rgba(238,236,229,.45)';c.lineWidth=.6;c.strokeRect(xx+2,y+17,(w-44)/3,h-38);
        }
    }else if(p.decorType==='ns_sofa'){
        B(c,x,y,w,h,'#152e50',T.metal,9);B(c,x+8,y+7,w-16,h-13,'#29486d','#536e8b',6);
        for(let xx=x+12;xx<x+w-9;xx+=12){c.strokeStyle='#3d5b7f';c.lineWidth=.6;c.beginPath();c.moveTo(xx,y+9);c.lineTo(xx,y+h-9);c.stroke();}
        B(c,x+2,y+3,8,h-6,'#1c385c','#9aabba',4);B(c,x+w-10,y+3,8,h-6,'#1c385c','#9aabba',4);
    }else if(p.decorType==='ns_tree'){
        const cx=x+w/2,cy=y+h/2,g=c.createRadialGradient(cx-3,cy-3,1,cx,cy,w/2);g.addColorStop(0,'#d8c8ff');g.addColorStop(.5,'#6a3ab8');g.addColorStop(1,'#241050');
        c.fillStyle=g;c.beginPath();c.arc(cx,cy,w/2,0,Math.PI*2);c.fill();c.strokeStyle='#d8c6a0';c.lineWidth=1;c.stroke();
    }else if(p.decorType==='ns_planter'){
        B(c,x,y,w,h,'#14293d',T.gold,6);B(c,x+4,y+4,w-8,h-8,'#0a1926',null,3);
        for(let i=0;i<12;i++){const a=i*Math.PI*2/12;c.fillStyle=i%2?'#3e7176':'#244e57';c.beginPath();c.ellipse(x+w/2+Math.cos(a)*8,y+h/2+Math.sin(a)*8,9,3,a,0,Math.PI*2);c.fill();}
    }
}
// The artificial trees: violet crystal boughs whose leaves glow (canopies drawn over the room in drawNeuralGlow).
const NEURAL_TREES=[[215,262],[785,262],[432,478],[568,478]];
function neuralCanopy(){
    if(neuralCanopy.cv)return neuralCanopy.cv;
    const R=60,cv=document.createElement('canvas');cv.width=cv.height=R*2;const c=cv.getContext('2d'),r=seededRandom(4242);
    // A soft violet mass, then leaves clustered in seven lobes: dark beneath, orchid above, glowing at the tips.
    const m=c.createRadialGradient(R,R,6,R,R,52);m.addColorStop(0,'rgba(60,20,110,.95)');m.addColorStop(.75,'rgba(48,16,96,.85)');m.addColorStop(1,'rgba(40,10,80,0)');
    c.fillStyle=m;c.beginPath();c.arc(R,R,52,0,Math.PI*2);c.fill();
    const lobes=[...Array(7)].map((_,i)=>{const a=i*Math.PI*2/7+.3;return [R+Math.cos(a)*27,R+Math.sin(a)*27];}).concat([[R,R]]);
    for(const [n,cols,spread,alpha] of [[110,['#3c1670','#4a1c88'],17,1],[90,['#7038c8','#8a4ae0','#5c2cb0'],15,1],[34,['#d6a8ff','#c4e8ff'],13,.85]])
        for(let i=0;i<n;i++){
            const [lx,ly]=lobes[i%lobes.length],a=r()*Math.PI*2,d=r()*spread,x=lx+Math.cos(a)*d,y=ly+Math.sin(a)*d,s=2.4+r()*2;
            c.globalAlpha=alpha;c.fillStyle=cols[i%cols.length];c.beginPath();c.ellipse(x,y,s,s*.55,a,0,Math.PI*2);c.fill();
        }
    c.globalAlpha=1;
    return neuralCanopy.cv=cv;
}
engineMixin({
    drawNeuralInterior(c){if(!this._neuralFloor)this._neuralFloor=this._paintNeuralFloor();c.drawImage(this._neuralFloor,0,0);},
    _paintNeuralFloor(){
        const cv=document.createElement('canvas');cv.width=1000;cv.height=800;const c=cv.getContext('2d'),B=NeuralArt.box,T=NEURAL,r=seededRandom(808);
        // Veined marble: each slab its own shade, silver-white veins, a polished diagonal sheen.
        const marble=(x,y,w,h,cw,ch,a,b,vein,n)=>{
            c.save();c.beginPath();c.rect(x,y,w,h);c.clip();
            for(let yy=y;yy<y+h;yy+=ch)for(let xx=x;xx<x+w;xx+=cw){
                const g=c.createLinearGradient(xx,yy,xx+cw,yy+ch);g.addColorStop(0,a[(xx/cw+yy/ch)%2|0]);g.addColorStop(1,b);
                c.fillStyle=g;c.fillRect(xx,yy,cw,ch);
                c.fillStyle='rgba(200,225,255,.05)';c.beginPath();c.moveTo(xx,yy);c.lineTo(xx+cw*.55,yy);c.lineTo(xx,yy+ch*.55);c.closePath();c.fill();
            }
            for(let i=0;i<n;i++){
                let xx=x+r()*w,yy=y+r()*h;c.strokeStyle=vein[i%vein.length];c.lineWidth=.5+r()*1.1;c.beginPath();c.moveTo(xx,yy);
                for(let j=0;j<6;j++){const nx=xx+(r()-.25)*60,ny=yy+(r()-.5)*40;c.quadraticCurveTo((xx+nx)/2+(r()-.5)*20,(yy+ny)/2+(r()-.5)*20,nx,ny);xx=nx;yy=ny;}c.stroke();
            }
            c.strokeStyle='rgba(190,215,240,.22)';c.lineWidth=.7;
            for(let yy=y;yy<=y+h;yy+=ch){c.beginPath();c.moveTo(x,yy);c.lineTo(x+w,yy);c.stroke();}
            for(let xx=x;xx<=x+w;xx+=cw){c.beginPath();c.moveTo(xx,y);c.lineTo(xx,y+h);c.stroke();}
            c.restore();
        };
        c.fillStyle='#070f22';c.fillRect(0,0,1000,800);
        // Midnight sapphire marble through the showroom.
        marble(52,60,896,486,112,122,['#0e1f44','#0b1a3a'],'#060e24',['rgba(225,238,255,.3)','rgba(170,200,240,.2)','rgba(190,160,255,.16)'],110);
        // The grand aisle: pale ice marble from the door to the concierge.
        marble(420,256,160,290,80,72,['#b4c2d6','#aab9cf'],'#8ea2bf',['rgba(90,110,150,.35)','rgba(255,255,255,.5)'],30);
        c.strokeStyle='#d8c6a0';c.lineWidth=1.4;c.strokeRect(420,256,160,290);c.strokeStyle='rgba(216,198,160,.45)';c.lineWidth=.8;c.strokeRect(426,262,148,278);
        // Compass medallion under the chandelier: sapphire, silver and champagne.
        c.save();c.translate(500,394);
        const md=c.createRadialGradient(0,0,6,0,0,74);md.addColorStop(0,'#2a5da0');md.addColorStop(.6,'#122c5c');md.addColorStop(1,'#0a1838');
        c.fillStyle=md;c.beginPath();c.arc(0,0,74,0,Math.PI*2);c.fill();
        c.strokeStyle='#d8c6a0';c.lineWidth=1.6;c.stroke();c.strokeStyle='rgba(216,198,160,.5)';c.lineWidth=.8;c.beginPath();c.arc(0,0,66,0,Math.PI*2);c.stroke();
        for(let i=0;i<16;i++){const a=i*Math.PI/8,l=i%2?44:64;c.fillStyle=i%4===0?'#e6ecf6':i%2?'#4a78b8':'#9fb6d8';
            c.beginPath();c.moveTo(Math.cos(a)*l,Math.sin(a)*l);c.lineTo(Math.cos(a+.13)*12,Math.sin(a+.13)*12);c.lineTo(Math.cos(a-.13)*12,Math.sin(a-.13)*12);c.closePath();c.fill();}
        c.restore();
        NeuralArt.seal(c,500,394,30,'#e6ecf6');
        // Champagne inlay frames the showroom; silver light lines run along the walls.
        c.strokeStyle='rgba(216,198,160,.6)';c.lineWidth=1.3;c.strokeRect(62,70,876,466);
        c.strokeStyle='rgba(216,198,160,.25)';c.lineWidth=.8;c.strokeRect(70,78,860,450);
        NeuralArt.text(c,'N E U R A L   S Y S T E M S',500,91,23,T.pale);
        NeuralArt.text(c,'W.I.G.   /   S.K.I.N.   /   V.O.C.A.L.',500,122,9,'#b9cde2');
        c.fillStyle='#d8c6a0';c.fillRect(362,142,276,1);
        // Display bays: crystal recesses edged in light.
        for(const x of [99,798]){
            const g=c.createLinearGradient(x,0,x+103,0);g.addColorStop(0,'#0a1630');g.addColorStop(.5,'#132a52');g.addColorStop(1,'#0a1630');
            B(c,x,103,103,300,g,'#9cc0e6',3,1.2);B(c,x+5,108,93,290,null,'rgba(156,192,230,.3)',2);
        }
        // Tree beds: violet glass rings set in the marble.
        for(const [x,y] of NEURAL_TREES){
            const g=c.createRadialGradient(x,y,4,x,y,30);g.addColorStop(0,'#2a1050');g.addColorStop(1,'#0c0a26');
            c.fillStyle=g;c.beginPath();c.arc(x,y,30,0,Math.PI*2);c.fill();
            c.strokeStyle='#b49cff';c.lineWidth=1.3;c.stroke();c.strokeStyle='rgba(216,198,160,.6)';c.lineWidth=.8;c.beginPath();c.arc(x,y,34,0,Math.PI*2);c.stroke();
            for(let i=0;i<14;i++){const a=r()*6.28,d=8+r()*18;c.fillStyle=i%2?'#a070ff':'#d0b8ff';c.beginPath();c.ellipse(x+Math.cos(a)*d,y+Math.sin(a)*d,2.2,1.1,a,0,Math.PI*2);c.fill();}
        }
        // The entry: pale marble threshold with silver channels.
        marble(420,551,160,199,80,66,['#aebdd2','#a4b4cc'],'#8094b2',['rgba(255,255,255,.45)','rgba(80,100,140,.3)'],18);
        for(const x of [436,563]){c.fillStyle='#8fc0f0';c.fillRect(x,571,1.5,159);}
        NeuralArt.text(c,'WELCOME',500,709,9,'#22385e');
        // Private styling: plush violet carpet, sheer curtain folds along its walls.
        B(c,53,568,344,178,'#1c1440','#8c7cc0',4);B(c,62,576,326,162,'#241a52','rgba(200,180,255,.35)',4);
        c.strokeStyle='rgba(200,180,255,.12)';c.lineWidth=1;for(let xx=70;xx<390;xx+=7){c.beginPath();c.moveTo(xx,579);c.quadraticCurveTo(xx+3,585,xx,592);c.stroke();}
        B(c,605,568,341,178,'#081329','#526d8b',4);
        NeuralArt.text(c,'PRIVATE STYLING',225,600,10,'#d6ccf2');
        NeuralArt.text(c,'THE COLLECTION',776,579,8,'#9bb9d0');
        NeuralArt.text(c,'PRISMA / CLIENT SERVICES',500,263,8,'#3a4c6a');
        // Depth: the marble falls into shadow at the walls.
        for(const [x0,y0,x1,y1,rx,ry,rw,rh] of [[52,60,52,110,52,60,896,50],[52,60,102,60,52,60,50,486],[948,60,898,60,898,60,50,486]]){
            const g=c.createLinearGradient(x0,y0,x1,y1);g.addColorStop(0,'rgba(2,4,14,.6)');g.addColorStop(1,'rgba(2,4,14,0)');c.fillStyle=g;c.fillRect(rx,ry,rw,rh);
        }
        return cv;
    },
    drawNeuralGlow(c){
        const mirror=c!==this.ctx,t=_frameTime/1000;
        c.save();c.globalCompositeOperation='lighter';
        // Downlight pools over the bays, champagne spots on the displays
        for(const x of [150,850])for(const y of [160,340]){glowA(c,x,y,46,'150, 195, 245',.22);glowA(c,x,y-6,20,'255, 232, 196',.2);}
        // Silver light lines tracing the showroom
        c.globalAlpha=mirror?.25:.5;c.strokeStyle='#9fd0ff';c.lineWidth=1.2;c.strokeRect(58,66,884,474);
        // The crystal pulse: the medallion breathes slowly, as if the building is thinking
        c.globalAlpha=.1+.06*Math.sin(t*.8);NeuralArt.seal(c,500,394,52,'#7fb8ff');
        glowA(c,500,394,90,'110, 160, 255',.1+.04*Math.sin(t*.8));
        // Chandelier above the medallion: a ring of crystal drops
        for(let i=0;i<12;i++){const a=i*Math.PI/6+t*.05;glowA(c,500+Math.cos(a)*28,394+Math.sin(a)*28,6,'220, 236, 255',.32);}
        glowA(c,500,394,10,'255, 246, 230',.35);
        // The trees' light on the marble
        for(const [x,y] of NEURAL_TREES)glowA(c,x,y,80,'160, 90, 255',.2+.04*Math.sin(t*1.1+x));
        if(!mirror){
            // Holographic readouts drifting over the consoles
            c.lineWidth=1;c.strokeStyle='#8fd8ff';
            for(const [x,y] of [[150,118],[150,298],[850,118],[850,298]]){
                c.globalAlpha=.45;c.beginPath();
                for(let i=0;i<=24;i++){const xx=x-22+i*44/24,yy=y-6+Math.sin(i*.7+t*3+x)*3*Math.sin(i*Math.PI/24);i?c.lineTo(xx,yy):c.moveTo(xx,yy);}c.stroke();
            }
            // The canopies: violet boughs with glowing leaves, over everything
            const cv=neuralCanopy();c.globalCompositeOperation='source-over';
            for(const [x,y] of NEURAL_TREES){c.globalAlpha=.92;c.drawImage(cv,x-cv.width/2,y-cv.height/2);}
            c.globalCompositeOperation='lighter';
            for(const [x,y] of NEURAL_TREES)for(let i=0;i<5;i++){
                const a=i*1.256+t*.3+x,d=22+8*Math.sin(t*.9+i);glowA(c,x+Math.cos(a)*d,y+Math.sin(a)*d,7,i%2?'200, 140, 255':'170, 220, 255',.25+.15*Math.sin(t*2+i+y));
            }
        }
        c.restore();
    }
});
