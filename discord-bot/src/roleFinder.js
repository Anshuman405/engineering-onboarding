module.exports = function findRole(
guild,
roleName
){


return guild.roles.cache.find(

role =>

role.name.toLowerCase()
===
roleName.toLowerCase()

);


};