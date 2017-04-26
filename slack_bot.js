
var axios = require('axios')
var _ = require('underscore')
var os = require('os')
var Botkit = require('./lib/Botkit.js')
var constants = require('./constants.js')

const { botToken, mySlackToken, channelId, channelName, postChannel } = constants

if (!process.env.token) {
    console.log('Error: Specify token in environment');
    process.exit(1);
}

var controller = Botkit.slackbot({
    debug: true,
});

var bot = controller.spawn({
    token: process.env.token
}).startRTM();

const tags = [
  'code', 'api', 'docker', 'react', 'javascript', 'ruby',
  'design', 'product', 'ui', 'ux', 'swift', 'mobile',
  'frontend', 'backend', 'css', 'animation' ,'architecture', 'performance', 'security',
  'random' ,'all', 'testing', 'rails']

const sortedBoldedTags = tags.sort().map((t)=>{return `*- ${t}*\n`}).join("")

controller.hears('tags', 'direct_message,direct_mention,mention', function(bot, message) {
  bot.reply(message, `The available collections are\n${sortedBoldedTags}Tag or DM me with a specific collection name!`)
})

const regexUrl = /^(http[s]?:\/\/){0,1}(www\.){0,1}[a-zA-Z0-9\.\-]+\.[a-zA-Z]{2,5}[\.]{0,1}/
var userName

controller.hears(['collect (.*)'],'direct_message,direct_mention,mention', function(bot, message) {
  let input = message.match[1].split(/[\s,]+/)
  let url = input.find((w)=>{return (w[0]==='<' && w[w.length-1]==='>')})
  let tagIndex = input.findIndex((w)=>{return w==='tag'})
  let taggedAs = _.intersection(input, tags)
  let formattedTagged = taggedAs.map((tag)=>{return `#${tag}`}).join(" ")

  if(url){
    axios.get(`https://slack.com/api/users.profile.get`, {
      params: {
        token: mySlackToken,
        user: message.user
      }
    })
    .then(function (response) {
      userName = response.data.profile.first_name

      console.log(`WHAT DOES THIS MESSAGE LOOK LIKE ${JSON.stringify(message)}`)

      axios.get(`https://slack.com/api/chat.postMessage`, {
        params: {
          token: botToken,
          channel: channelId,
          text: `:bookmark: ${url} shared by ${userName} ${formattedTagged}`,
          as_user: true
        }
      })
      .then(function (response) {
        if(message.channel!=channelId){
          bot.reply(message, `Got the link :nerd_face: ${url}. Thanks ${userName}!\nSee all links here at <#${channelId}|${channelName}>`)
        }
      })
      .catch(function (error) {
        bot.reply(message,`Posting to <#${channelId}|${channelName}> failed`)
      })

    })
    .catch((error) => {
      bot.reply(`something went wrong ${error}`)
    })
  } else {
    bot.reply(message, `Not a valid link! Try again.`)
  }
})

controller.hears(tags, 'direct_message,direct_mention,mention', function(bot, message) {
  let keyWord = message.match[0]
  axios.get(`https://slack.com/api/channels.history`, {
    params: {
      token: mySlackToken,
      channel: channelId
    }
  }).then((response) => {

    let collection = []
    let msgs = response.data.messages
    console.log(msgs)
    if(keyWord==='all'){
      msgs.forEach((m)=>{
        if(m.text.includes(":bookmark:")
        && !m.text.includes(":information_source:")
        && m.bot_id==='B49CK01GR'){
          collection.push(`${m.text} \n`)
        }
      })
    } else {
      msgs.forEach((m)=>{
        if(m.text.includes(":bookmark:")
        && !m.text.includes(":information_source:")
        && m.text.includes(keyWord)
        && m.bot_id==='B49CK01GR'){
          collection.push(`${m.text} \n`)
        }
      })
    }

    let result = collection.length!=0 ? collection.join("\n") : "        Sorry, nothing is found in this category!\n        Try *all* to see all bookmarked links."

    let resp = keyWord==='all' ? `Here are all the bookmarked links:`: `Looking up *${keyWord}* related bookmarks...`
    bot.reply(message, `:information_source: ${resp}\n${result}`)

  })



})




controller.hears(['call me (.*)', 'my name is (.*)'], 'direct_message,direct_mention,mention', function(bot, message) {
    var name = message.match[1];
    controller.storage.users.get(message.user, function(err, user) {
        if (!user) {
            user = {
                id: message.user,
            };
        }
        user.name = name;
        controller.storage.users.save(user, function(err, id) {
            bot.reply(message, 'Got it. I will call you ' + user.name + ' from now on.');
        });
    });
});

controller.hears(['what is my name', 'who am i'], 'direct_message,direct_mention,mention', function(bot, message) {

    controller.storage.users.get(message.user, function(err, user) {
        if (user && user.name) {
            bot.reply(message, 'Your name is ' + user.name);
        } else {
            bot.startConversation(message, function(err, convo) {
                if (!err) {
                    convo.say('I do not know your name yet!');
                    convo.ask('What should I call you?', function(response, convo) {
                        convo.ask('You want me to call you `' + response.text + '`?', [
                            {
                                pattern: 'yes',
                                callback: function(response, convo) {
                                    // since no further messages are queued after this,
                                    // the conversation will end naturally with status == 'completed'
                                    convo.next();
                                }
                            },
                            {
                                pattern: 'no',
                                callback: function(response, convo) {
                                    // stop the conversation. this will cause it to end with status == 'stopped'
                                    convo.stop();
                                }
                            },
                            {
                                default: true,
                                callback: function(response, convo) {
                                    convo.repeat();
                                    convo.next();
                                }
                            }
                        ]);

                        convo.next();

                    }, {'key': 'nickname'}); // store the results in a field called nickname

                    convo.on('end', function(convo) {
                        if (convo.status == 'completed') {
                            bot.reply(message, 'OK! I will update my dossier...');

                            controller.storage.users.get(message.user, function(err, user) {
                                if (!user) {
                                    user = {
                                        id: message.user,
                                    };
                                }
                                user.name = convo.extractResponse('nickname');
                                controller.storage.users.save(user, function(err, id) {
                                    bot.reply(message, 'Got it. I will call you ' + user.name + ' from now on.');
                                });
                            });



                        } else {
                            // this happens if the conversation ended prematurely for some reason
                            bot.reply(message, 'OK, nevermind!');
                        }
                    });
                }
            });
        }
    });
});

controller.hears(['shutdown'], 'direct_message,direct_mention,mention', function(bot, message) {

    bot.startConversation(message, function(err, convo) {

        convo.ask('Are you sure you want me to shutdown?', [
            {
                pattern: bot.utterances.yes,
                callback: function(response, convo) {
                    convo.say('Bye!');
                    convo.next();
                    setTimeout(function() {
                        process.exit();
                    }, 3000);
                }
            },
        {
            pattern: bot.utterances.no,
            default: true,
            callback: function(response, convo) {
                convo.say('*Phew!*');
                convo.next();
            }
        }
        ]);
    });
});


controller.hears(['uptime', 'identify yourself', 'who are you', 'what is your name', 'how to use', 'instructions'],
    'direct_message,direct_mention,mention', function(bot, message) {

        var hostname = os.hostname();
        var uptime = formatUptime(process.uptime());

        bot.reply(message,
          `I am a bot named <@${bot.identity.name}>.\nI have been running for ${uptime} on ${hostname}.\n`
          + "Tag or DM me to run the following commands: \n"
          + "_To add bookmarks, *collect URL tags*_ ```collect [https://…] [tag1] [tag2]```\n"
          + "_To see all tags_ ```tags```\n"
          + "_To see all links of a certain tag_ ```[tagName]```\n"
          + "_To see all links_ ```all```\n"
          + "Replace the interpolated values with your own.\n"
          + "Reach out to <@yicheny> for questions, feedback, or feature requests :robot_face:")
    });

function formatUptime(uptime) {
    var unit = 'second';
    if (uptime > 60) {
        uptime = uptime / 60;
        unit = 'minute';
    }
    if (uptime > 60) {
        uptime = uptime / 60;
        unit = 'hour';
    }
    if (uptime != 1) {
        unit = unit + 's';
    }

    uptime = uptime + ' ' + unit;
    return uptime;
}

controller.hears(['hello', 'hi'], 'direct_message,direct_mention,mention', function(bot, message) {
  controller.storage.users.get(message.user, function(err, user) {
      if (user && user.name) {
          bot.reply(message, 'Hello ' + user.name + '!!');
      } else {
          bot.reply(message, 'Hello. To save a link, format your message like so:\n"collect *link* tag *product* *ui*"\n Type *tags* to see available tags.');
      }
  });
});
