// The apartment's rooms come from the Basement map system's room graph (volumes in the shared spatial
// grid, links through its doors). This keeps the classic RoomSystem's interface for the game's callers.
class ApartmentRooms {
    constructor(level,game){this.level=level;this.game=game;this.active=true;this.rooms={};this.doors=level.doors;this.windows=[];this.linens=[];this.graph=level.map.rooms;
        for(const[id,r]of Object.entries(level.definition.rooms.rooms))this.rooms[id]={...r,id,lightsOff:!!game.questState.apartmentLights?.[id],lightK:1,vis:1};
        this.graph.track(level.player);this.update();}
    getRoomAt(x,y){const room=this.graph.roomAt([x,y]);return room?this.rooms[room.id]:null;}
    update(){if(this.graph.roomOf(this.level.player)===null)this.graph.track(this.level.player);this.graph.update();const room=this.graph.roomOf(this.level.player);this.currentRoom=room?this.rooms[room.id]:null;this.outdoorness=this.currentRoom?.type==='outdoor'?1:0;}
    isPlayerOutdoor(){return this.outdoorness>0;}
    openingBetween(a,b){return this.graph.openness(a,b);}
    lightAt(x,y){return this.getRoomAt(x,y)?.lightsOff?0:1;}
    toggleRoomLights(id){const room=this.rooms[id];if(!room)return false;room.lightsOff=!room.lightsOff;(this.game.questState.apartmentLights??={})[id]=room.lightsOff;return room.lightsOff;}
    clear(){this.active=false;this.rooms={};this.doors=[];}
    tagLamps(){}
}
