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
    }else if(p.decorType==='ns_planter'){
        B(c,x,y,w,h,'#14293d',T.gold,6);B(c,x+4,y+4,w-8,h-8,'#0a1926',null,3);
        for(let i=0;i<12;i++){const a=i*Math.PI*2/12;c.fillStyle=i%2?'#3e7176':'#244e57';c.beginPath();c.ellipse(x+w/2+Math.cos(a)*8,y+h/2+Math.sin(a)*8,9,3,a,0,Math.PI*2);c.fill();}
    }
}
engineMixin({
    drawNeuralInterior(c){if(!this._neuralFloor)this._neuralFloor=this._paintNeuralFloor();c.drawImage(this._neuralFloor,0,0);},
    _paintNeuralFloor(){
        const cv=document.createElement('canvas');cv.width=1000;cv.height=800;const c=cv.getContext('2d'),B=NeuralArt.box,T=NEURAL;
        c.fillStyle='#10223b';c.fillRect(0,0,1000,800);
        B(c,52,60,896,486,'#1a3454','#7b92ab',2);
        // Large crystal floor slabs and reflected light ribbons establish a retail salon.
        for(let row=0;row<4;row++)for(let col=0;col<6;col++){
            const x=52+col*150,y=60+row*122;
            c.save();c.beginPath();c.rect(52,60,896,486);c.clip();
            c.fillStyle=(row+col)%2?'#1b3658':'#172f4d';c.fillRect(x,y,150,122);
            c.fillStyle='rgba(137,175,211,.07)';c.beginPath();c.moveTo(x,y);c.lineTo(x+150,y+122);c.lineTo(x,y+122);c.closePath();c.fill();
            c.strokeStyle='rgba(165,190,213,.19)';c.lineWidth=.6;c.strokeRect(x,y,150,122);c.restore();
        }
        B(c,370,280,260,240,'#172b44','#8999a9',4,1);
        B(c,379,289,242,222,null,'#4c637e',2);
        NeuralArt.seal(c,500,394,52,'#708eac');
        NeuralArt.text(c,'N E U R A L   S Y S T E M S',500,91,23,T.pale);
        NeuralArt.text(c,'W.I.G.   /   S.K.I.N.   /   V.O.C.A.L.',500,122,9,'#93aec7');
        c.fillStyle=T.gold;c.fillRect(362,142,276,1);
        // Inlaid display bays and unobstructed central approach.
        for(const x of [99,798]){B(c,x,103,103,300,'#142942','#6c8299',3);}
        B(c,420,551,160,199,'#0a1930','#637f9b',3);
        for(const x of [436,563]){c.fillStyle='#3a6896';c.fillRect(x,571,1.5,159);}
        NeuralArt.text(c,'WELCOME',500,709,9,T.pale);
        B(c,53,568,344,178,'#192f4c','#667b92',4);B(c,62,576,326,162,null,'#314e6e',4);
        B(c,605,568,341,178,'#0b192d','#526d8b',4);
        NeuralArt.text(c,'PRIVATE STYLING',225,592,10,'#adbed0');
        NeuralArt.text(c,'THE COLLECTION',776,579,8,'#9bb9d0');
        NeuralArt.text(c,'PRISMA / CLIENT SERVICES',500,263,8,'#c7bda9');
        return cv;
    },
    drawNeuralGlow(c){
        c.save();c.globalCompositeOperation='lighter';c.globalAlpha=.2;
        for(const x of [150,850])for(const y of [160,340])drawGlow(c,x,y,36,'92, 157, 226',.4);
        c.globalAlpha=.09;NeuralArt.seal(c,500,394,52,'#6192d0');c.restore();
    }
});
