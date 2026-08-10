require("dotenv").config();

const express = require("express");

const {
    Client,
    GatewayIntentBits,
    EmbedBuilder
} = require("discord.js");

const findRole = require("./roleFinder");
const findChannel = require("./channelFinder");


const app = express();

app.use(express.json());



const client = new Client({

    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers
    ]

});



/*
|--------------------------------------------------------------------------
| Discord Ready
|--------------------------------------------------------------------------
*/

client.once(
    "clientReady",
    async () => {

        console.log(
            `Bot online: ${client.user.tag}`
        );


        const guild =
            client.guilds.cache.get(
                process.env.GUILD_ID
            );


        if (!guild) {

            console.log(
                "Guild not found"
            );

            return;

        }


        console.log(
            "Connected to:",
            guild.name
        );


        const roles =
            await guild.roles.fetch();


        console.log(
            "Roles loaded:",
            roles.size
        );


        const channels =
            await guild.channels.fetch();


        console.log(
            "Channels loaded:",
            channels.size
        );

    }
);





/*
|--------------------------------------------------------------------------
| New Member Join
|--------------------------------------------------------------------------
*/

client.on(
    "guildMemberAdd",
    async (member)=>{


        try {


            await member.send(
`
Welcome to Venu!

Please complete your onboarding form:

${process.env.TALLY_FORM_URL}

Your access and team setup will be automatically configured.
`
            );


        } catch(error){


            console.log(
                "Could not DM user:",
                error.message
            );


        }


    }
);





/*
|--------------------------------------------------------------------------
| Tally → Google Sheets → Apps Script
|--------------------------------------------------------------------------
*/

app.post(
    "/onboarding",
    async(req,res)=>{


        try {


            const data = req.body;


            console.log(
                "Received onboarding:",
                JSON.stringify(
                    data,
                    null,
                    2
                )
            );



            const guild =
                client.guilds.cache.get(
                    process.env.GUILD_ID
                );



            const members =
                await guild.members.fetch();



            const member =
                members.find(
                    m =>
                    m.id === data.discord ||
                    m.user.username === data.discord ||
                    m.displayName === data.discord
                );



            if(!member){


                console.log(
                    "Discord user not found:",
                    data.discord
                );


                return res.status(404).json({

                    error:
                    "Discord member not found"

                });


            }




            /*
            Assign Default Roles

            Every new hire receives:
            - Venu
            - IT
            - Product

            Team roles are NOT assigned.
            */


            const defaultRoles = [

                "Venu",
                "IT",
                "Product"

            ];



            const botMember =
                await guild.members.fetchMe();



            for(
                const roleName of defaultRoles
            ){


                const role =
                    findRole(
                        guild,
                        roleName
                    );



                if(!role){

                    console.log(
                        `Missing role: ${roleName}`
                    );

                    continue;

                }



                if(
                    role.position >=
                    botMember.roles.highest.position
                ){

                    console.log(
                        `Cannot assign ${roleName}. Bot role too low.`
                    );

                    continue;

                }



                try{


                    await member.roles.add(role);


                    console.log(
                        `Added role: ${roleName}`
                    );


                }catch(error){


                    console.log(
                        `Role error ${roleName}:`,
                        error.message
                    );


                }


            }





            /*
            Training Channel Announcement
            */


            const trainingChannel =
                guild.channels.cache.find(
                    channel =>
                    channel.name.toLowerCase()
                    === "training"
                );



            if(trainingChannel){


                const embed =
                    new EmbedBuilder()

                    .setTitle(
                        "New Team Member Onboarded"
                    )

                    .setDescription(
`
**Name**
${data.name}

**GitHub**
${data.github}

**Teams**
${data.team}

Welcome to Venu!
`
                    )

                    .setFooter({

                        text:
                        "Engineering Onboarding Bot"

                    })

                    .setTimestamp();



                await trainingChannel.send({

                    embeds:[
                        embed
                    ]

                });


                console.log(
                    "Training message sent"
                );


            }





            /*
            Team Channel Messages

            Campaign, Event Manager, DevOps, etc.
            are only channels.
            */


            const teams =
                data.team
                .split(",")
                .map(
                    t=>t.trim()
                );



            for(
                const team of teams
            ){


                const channel =
                    findChannel(
                        guild,
                        team
                    );



                if(channel){


                    await channel.send({

                        embeds:[

                            new EmbedBuilder()

                            .setTitle(
                                "New Team Member"
                            )

                            .setDescription(
`
**${data.name}** has joined the team.

**GitHub**
${data.github}
`
                            )

                            .setFooter({

                                text:
                                "Engineering Onboarding Bot"

                            })

                            .setTimestamp()

                        ]

                    });


                    console.log(
                        `Sent message to ${channel.name}`
                    );


                }


            }




            res.json({

                success:true

            });



        }catch(error){


            console.error(
                error
            );


            res.status(500).json({

                error:
                error.message

            });


        }


    }
);





app.get(
    "/",
    (req,res)=>{

        res.send(
            "Onboarding bot running"
        );

    }
);





app.listen(
    process.env.PORT || 3000,
    ()=>{

        console.log(
            "API running"
        );

    }
);




client.login(
    process.env.DISCORD_TOKEN
);