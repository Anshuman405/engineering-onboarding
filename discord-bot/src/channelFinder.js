module.exports=function findChannel(
guild,
team
){


return guild.channels.cache.find(

channel =>

channel.name.toLowerCase()
===
team
.toLowerCase()
.replace(" ","-")

);


};