const Server = require('../database/ServerSchema');
const { Permissions } = require('discord.js');
const setip = require('../commands/setip.js');
const util = require('minecraft-server-util');
const { lookup } = require('../modules/cache.js');

module.exports = {
    name: 'setup',
    description: 'Create the two channels that will display the server status',
    options: 'ip',
    admin: true,
    async execute(message, args, client, bypass) {
        // Check if the person is admin
        if (!message.member.permissions.has(Permissions.FLAGS.ADMINISTRATOR) && message.member.id != (process.env.OWNERID).toString()) {
            message.channel.send('You have to be a admin to use this command!');
            return;
        }

        if (args.length > 0) {
            try {
                setip.execute(message, args, client);
            } catch (error) {
                console.error(error);
                message.reply({ content: 'Uh, oh! An error occurred while trying to set the ip! (**X  _  X**)', allowedMentions: { repliedUser: false } })
            }
        }

        // Check if bot has all the permissions
        if (!message.guild.me.permissions.has(Permissions.FLAGS.MANAGE_ROLES) && !message.guild.me.permissions.has(Permissions.FLAGS.MANAGE_CHANNELS)) {
            message.channel.send("I don't have the necessary permissions to perform this action! - `Manage roles` and `Manage channels`");
            return;
        } else if (!message.guild.me.permissions.has(Permissions.FLAGS.MANAGE_CHANNELS)) {
            message.channel.send("I don't have the necessary permissions to perform this action! - `Manage channels`");
            return;
        } else if (!message.guild.me.permissions.has(Permissions.FLAGS.MANAGE_ROLES)) {
            message.channel.send("I don't have the necessary permissions to perform this action! - `Manage roles`");
            return;
        }

        // Get the ip of the server
        const result = await lookup('Server', message.guild.id);
        const ip = result.IP.split(':')[0].toLowerCase();

        // Check if monitoring channels already exist. if they do remove them
        if (result.StatusChannId && result.NumberChannId && result.CategoryId) {
            // Remove the channels
            try {
                await message.guild.channels.cache.get(result.StatusChannId).delete();
                await message.guild.channels.cache.get(result.NumberChannId).delete();
                await message.guild.channels.cache.get(result.CategoryId).delete();
            } catch (err) {
                console.error(err);
            }
        }

        // check if server has a defined ip
        if (!ip) {
            message.channel.send('Please use`mc!setip` to set a ip to monitor!');
            return;
        }

        // Create category
        let Category;
        await message.guild.channels.create(`${ip}'s status`, {
            type: 'GUILD_CATEGORY',
            permissionOverwrites: [{
                id: message.guild.me.roles.highest,
                allow: ['VIEW_CHANNEL', 'MANAGE_CHANNELS', 'CONNECT']
            }]
        }).then((channel) => {
            channel.permissionOverwrites.edit(channel.guild.roles.everyone, {
                CONNECT: false
            });
            Category = channel;
        })

        // Crate channels and add to category
        let StatusChan;
        await message.guild.channels.create('Updating status. . .', {
            type: 'GUILD_VOICE'
        }).then(async function(channel) {
            await channel.setParent(Category.id);
            StatusChan = channel;
        })
        let NumberChan;
        await message.guild.channels.create('Updating players . . .', {
            type: 'GUILD_VOICE'
        }).then(async function(channel) {
            await channel.setParent(Category.id);
            NumberChan = channel;
        })

        // Write to database
        Server.findByIdAndUpdate({
                _id: message.guild.id
            }, {
                "StatusChannId": StatusChan.id,
                "NumberChannId": NumberChan.id,
                "CategoryId": Category.id
            }, {
                useFindAndModify: false,
                new: true
            }).cache()
            .then(() => message.channel.send('The channels have been created successfully! Please allow up to five minutes for the channels to update.'))
            .catch((err) => console.error(err))


        const portnum = Number(result.IP.split(':')[1]);
        const port = portnum < 65536 || portnum > 0 ? portnum : NaN;

        if (result.Bedrock == true) {
            var pinger = util.statusBedrock(ip.split(':')[0].toLowerCase(), { port: port ? port : 19132 })
        } else {
            var pinger = util.status(ip.split(':')[0].toLowerCase(), { port: port ? port : 25565 })
        }

        pinger
            .then((pingresult) => {
                // Aternos servers stay online and display Offline in their MOTD when they are actually offline
                if (!pingresult || (ip.includes('aternos.me') && pingresult.version == '● Offline')) {
                    // server is offline
                    servoffline();
                } else {
                    // server is online
                    servonline(pingresult);
                }
            })
            .catch((error) => {
                // server is offline
                servoffline();
            })

        async function servonline(pingresult) {
            // server is online
            await client.channels.cache.get(StatusChan.id).setName('🟢 ONLINE');
            const chann = client.channels.cache.get(NumberChan.id);
            await chann.permissionOverwrites.edit(chann.guild.roles.everyone, {
                VIEW_CHANNEL: true
            });
            await chann.setName(`👥 Players online: ${pingresult.onlinePlayers}`)
        }
        async function servoffline() {
            await client.channels.cache.get(StatusChan.id).setName('🔴 OFFLINE');
            const chann = client.channels.cache.get(NumberChan.id);
            await chann.permissionOverwrites.edit(chann.guild.roles.everyone, {
                VIEW_CHANNEL: false
            });
            await chann.setName(`👥 Players online: 0`)
        }
    }
}