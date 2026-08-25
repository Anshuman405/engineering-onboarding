require("dotenv").config();

const express = require("express");

const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    REST,
    Routes
} = require("discord.js");

const discordIntents = [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
];

const findRole = require("./roleFinder");
const findChannel = require("./channelFinder");

const {
    eosCommand,
    handleEosCommand
} = require("./eos/commands");

const {
    statusCommand,
    handleStatusCommand
} = require("./status/command");
const { StatusMonitorManager } = require("./status/monitor");

const statusMonitor = new StatusMonitorManager();



const app = express();

app.use(express.json());



const client = new Client({
    intents: discordIntents

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

                const rest = new REST({ version: "10" }).setToken(
            process.env.DISCORD_TOKEN
        );

        await rest.put(
            Routes.applicationGuildCommands(
                client.user.id,
                process.env.GUILD_ID
            ),
            {
                body: [
                    eosCommand.toJSON(),
                    statusCommand.toJSON()
                ]
            }
        );

        console.log("Registered /eos and /status commands");

    }
);





/*
|--------------------------------------------------------------------------
| New Member Join
|--------------------------------------------------------------------------
*/

client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) {
        return;
    }

    if (interaction.commandName === "eos") {
        await handleEosCommand(interaction);
    }

    if (interaction.commandName === "status") {
        try {
            await handleStatusCommand(interaction, statusMonitor);
        } catch (error) {
            console.error("Status command failed:", error?.message || error);
            const response = { content: "Status monitoring could not be started. Please try again.", embeds: [], components: [] };
            if (interaction.replied || interaction.deferred) await interaction.editReply(response).catch(() => undefined);
            else await interaction.reply({ ...response, ephemeral: true }).catch(() => undefined);
        }
    }
});

client.on("guildMemberAdd", async (member) => {
    const { syncMemberToEOS } = require("./eos/onboarding");

    try {
        await syncMemberToEOS(member);
        console.log(`Synced ${member.user.tag} to EOS`);
    } catch (error) {
        console.error("Failed to sync member to EOS:", error);
    }

    try {


        await member.send(
            `
Welcome to Venu!

Please complete your onboarding form:

${process.env.TALLY_FORM_URL}

Your access and team setup will be automatically configured.
`
        );


    } catch (error) {


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

            const {
                authorizeOnboardingWebhook,
                onboardingLogSummary
            } = require("./onboardingWebhook");

            const authorization =
                authorizeOnboardingWebhook(req);

            if (!authorization.ok) {
                return res.status(authorization.status).json({
                    error: authorization.error
                });
            }


            const data = req.body;
            const { syncTallyToEOS } = require("./eos/onboarding");

            console.log(
                "Received authenticated onboarding submission:",
                onboardingLogSummary(data)
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
                    "Discord user not found for authenticated onboarding submission"
                );


                return res.status(404).json({

                    error:
                    "Discord member not found"

                });


            }

            await syncTallyToEOS(data, member);

            console.log(
                `Synced Tally onboarding to EOS for ${member.user.tag}`
            );

            try {
                const {
                    sendVenuSetupInstructions
                } = require("./eos/venuSetup");

                await sendVenuSetupInstructions(member);

                console.log(
                    `Sent Venu 1.x setup instructions to ${member.user.tag}`
                );
            } catch (error) {
                console.log(
                    "Could not DM Venu 1.x setup instructions:",
                    error.message
                );
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





const httpServer = app.listen(
    process.env.PORT || 3000,
    ()=>{

        console.log(
            "API running"
        );

    }
);

let shuttingDown = false;

async function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    await statusMonitor.expireAll(
        "The bot is restarting. Run `/status` again after it returns to start a new 30-minute monitor."
    );
    client.destroy();
    httpServer.close(() => process.exit(0));
    const forcedExit = setTimeout(() => process.exit(0), 10_000);
    forcedExit.unref?.();
}

process.once("SIGTERM", () => void shutdown());
process.once("SIGINT", () => void shutdown());




client.login(
    process.env.DISCORD_TOKEN
);
