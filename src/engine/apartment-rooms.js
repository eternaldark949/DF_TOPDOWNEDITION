// Room lighting/door policy reads registered room volumes through the shared spatial service.
class ApartmentRooms {
    constructor(level,game){this.level=level;this.game=game;this.active=true;this.rooms={};this.doors=level.doors;this.windows=[];this.linens=[];
        for(const[id,r]of Object.entries(level.definition.rooms.rooms))this.rooms[id]={...r,id,lightsOff:!!game.questState.apartmentLights?.[id],lightK:1,vis:1};
        this.update();}
    getRoomAt(x,y){return this.level.physics.queryEntitiesInBounds({bounds:{left:x,right:x,top:y,bottom:y},include_ghosts:true}).map(h=>h.entity).filter(e=>e?.data.role==='room').map(e=>this.rooms[e.data.room_id])[0]??null;}
    update(){const p=this.level.player.position;this.currentRoom=this.getRoomAt(...p);this.outdoorness=this.currentRoom?.type==='outdoor'?1:0;}
    isPlayerOutdoor(){return this.outdoorness>0;}
    openingBetween(a,b){return this.doors.some(d=>d.data.open&&d.data.appearance.rooms.includes(a)&&d.data.appearance.rooms.includes(b))?1:0;}
    lightAt(x,y){return this.getRoomAt(x,y)?.lightsOff?0:1;}
    toggleRoomLights(id){const room=this.rooms[id];if(!room)return false;room.lightsOff=!room.lightsOff;(this.game.questState.apartmentLights??={})[id]=room.lightsOff;return room.lightsOff;}
    clear(){this.active=false;this.rooms={};this.doors=[];}
    tagLamps(){}
}
