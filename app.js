const fs = require("fs").promises;
const path = require("path");
const process = require("process");
const { authenticate } = require("@google-cloud/local-auth");
const { google, gmail_v1 } = require("googleapis");
const MailComposer = require("nodemailer/lib/mail-composer");
const cron = require("node-cron");
const { time } = require("console");

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.compose",
];
const TOKEN_PATH = path.join(process.cwd(), "token.json");
const CREDENTIALS_PATH = path.join(process.cwd(), "credentials.json");

/**
 * Reads previously authorized credentials from the save file.
 *
 * @return {Promise<OAuth2Client|null>}
 */
async function loadSavedCredentialsIfExist() {
  try {
    const content = await fs.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    console.log(credentials);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}

/**
 * Serializes credentials to a file compatible with GoogleAUth.fromJSON.
 *
 * @param {OAuth2Client} client
 * @return {Promise<void>}
 */
async function saveCredentials(client) {
  const content = await fs.readFile(CREDENTIALS_PATH);
  console.log(content);
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web || keys.desktop;
  const payload = JSON.stringify({
    type: "authorized_user",
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  await fs.writeFile(TOKEN_PATH, payload);
}

/**
 * Load or request or authorization to call APIs.
 *
 */
async function authorize() {
  let client = await loadSavedCredentialsIfExist();
  console.log("***");
  if (client) {
    return client;
  }
  console.log("*");
  console.log(CREDENTIALS_PATH);

  client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });
  console.log("****");

  if (client.credentials) {
    await saveCredentials(client);
  }
  console.log("*****");

  return client;
}

const encodeMessage = (message) => {
  return Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
};

const createMail = async (options) => {
  const mailComposer = new MailComposer(options);
  const message = await mailComposer.compile().build();
  return encodeMessage(message);
};

const sendMail = async (options, gmail) => {
  const rawMessage = await createMail(options);
  const { data: { id } = {} } = await gmail.users.messages.send({
    userId: "me",
    resource: {
      raw: rawMessage,
    },
    labels: ["VACATION"],
  });
  return id;
};

/**
 * Replies to the mails in vacation period.
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
async function checkMailsToReplyBack(auth) {
  const gmail = google.gmail({ version: "v1", auth });


//list all threads which are unread.
//added from my other email to make sure random people don't get mails.
  const res = await gmail.users.threads.list({
    userId: "me",
    q: "from:sushant2019@iiitkottayam.ac.in is:unread",
  });
  const threads = res.data.threads ? res.data.threads : [];

  //if threads are found
  if (threads.length > 0) {
    for (let thread of threads) {
      const threadData = await gmail.users.threads.get({
        userId: "me",
        id: thread.id,
      });
      console.log(threadData);
      console.log(
        "threadData.data.messages.length: " + threadData.data.messages.length
      );
      //if threads have exactly one message, i.e. there have been no replies to that thread before
      if (threadData.data.messages.length == 1) {
        for (let message of threadData.data.messages) {
          let recieverId;
          console.log(message);
          for (let header of message.payload.headers) {
            if (header.name == "From") {
              recieverId = header.value.split("<").slice(-1)[0].slice(0, -1);
              break;
            }
          }
          console.log(recieverId);
          console.log(message.id);
          //send an automated reply
          const options = {
            to: recieverId,
            replyTo: recieverId,
            subject: "automated reply",
            text: "I am on a new vacation. Talk to you in a while.",
            headers: { "In-Reply-To": message.id, References: message.id },
          };
          await sendMail(options, gmail);
          
          //marking the replied emails as read.
          await gmail.users.messages.modify({
            userId: "me",
            id: message.id,
            resource: {
              addLabelIds: [],
              removeLabelIds: ["UNREAD"],
            },
          });
        }
      }
    }
  }
}

//scheduling jobs with minimum 45 seconds of wait with random seconds added between 0-75 to make the range 45 to 120
cron.schedule("*/45 * * * * *", async () => {
  let randomNumber = Math.floor(Math.random() * 75) * 1000;
  await new Promise((r) => setTimeout(r, randomNumber));
  authorize().then(listLabels).catch(console.error);
});



/*
Libraries Used:
Node Mailer: To easily create email body.
Node-Cron: To setup cron job.
@google-cloud/local-auth: to setup oauth flow easily.
googleapis: To access gmail apis.


Areas where the code can be improved:
Due to lack of time I couldn't implement a simple try catch on every api call.
But that is definitely something I would do.

Since I had to submit in a single file, I wrote everything in one app.js.

I would have preferred modularising the functions.



I would also use guard programming, which generally doesn't come naturally

but is a wonderful code refactoring method to make it more readable.



I think there should be a way to minimise the API calls, although I couldn't figure

out in the given time.

 */