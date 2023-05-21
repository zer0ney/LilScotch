# 😵‍💫:tumbler_glass: Lil Scotch :ice_cube::city_sunrise:

A Discord.js bot that can make requests to your Stable Diffusion WebUI server and (optionally) OpenAI's DALL-E and return results. Currently supports Text to Image and Image to Image, as well as use of multiple models and parameters for model generation.

![Image of output](https://github.com/zer0ney/LilScotch/blob/c9aa8423c78cafe393d4fbe48e0e21ee18cf0daa/screenshots/bot-output.png)

## Requirements

- Node.js to run the bot. Download it from [here.](https://nodejs.org/en)
- [AUTOMATIC1111's Stable Diffusion Webui.](https://github.com/AUTOMATIC1111/stable-diffusion-webui) You can follow the instructions on the page to install it and feel free to kick it up to try it out - we'll change some things later on in the Setup section.
- **Optional:** If you want to use OpenAI's DALL-E (`/dalle` in the bot), you'll need to create an API key [here.](https://platform.openai.com/account/api-keys) If you aren't planning on using DALL-E, delete the `dalle.js` file in the `commands` folder once you clone the repo.

You'll also need to [create a Discord bot](https://discord.com/developers/applications) and join it to the server you want to use the bot in.

## Setup

- Clone this repo into a folder.
- Open `example.env` and change all of the fields as required, then rename the file to `.env`.
- Open up a terminal and navigate to the folder where the bot is.
- Run `npm install` and wait for the dependencies to install.
- Run `node utilities/refreshCommands.js`. You should see output stating `Successfully reloaded x application (/) commands.` (this may change depending on if you choose to include `/dalle`.)

Set up for the bot is done! Now for the Stable Diffusion Webui.

Navigate to the folder where you installed the Webui. Depending on whether you're running on Windows or Linux:
- Windows: Open `webui-user.bat` and after the line that says `set COMMANDLINE_ARGS=` add this: `--api --nowebui --listen`. It should look like `set COMMANDLINE_ARGS=--api --nowebui --listen`.
- Linux: Open `webui-user.sh` and after the line that says `export COMMANDLINE_ARGS=` add this: `--api --nowebui --listen`. It should look like `export COMMANDLINE_ARGS=--api --nowebui --listen`.

Now we'll be downloading the models you can use. I've set up three to use as defaults: Stable Diffusion 2.1, Realism, and DreamShaper. These models are good starting points, but if you want to use your own models you'll need to modify `img2img.js` and `text2img.js` to suit your needs.
- Download [Stable Diffusion 2.1](https://huggingface.co/stabilityai/stable-diffusion-2-1/resolve/main/v2-1_768-ema-pruned.safetensors), [Realism](https://civitai.com/api/download/models/20414?type=Model&format=SafeTensor&size=full&fp=fp16), and [DreamShaper](https://civitai.com/api/download/models/43888?type=Model&format=SafeTensor&size=full&fp=fp16). These files will download as `.safetensor` files.
- In your Stable Diffusion Webui folder, place the files you just downloaded in `/models/Stable-diffusion/`.
- Now run the webui - using either `webui.sh` or `webui.bat` depending on if you're on Linux or Windows respectively.
You should see output similar to the following:

![image of webui output](https://github.com/zer0ney/LilScotch/blob/c9aa8423c78cafe393d4fbe48e0e21ee18cf0daa/screenshots/stablediff-webui-output.png)

Now open up another terminal window and navigate to where your Discord bot is, and then run `node index.js` - your bot should come online in your server!

## FAQ

### What are all of the commands?

| Command | Description | Inputs |
| --- | --- | --- |
| `/dalle` | (Only if you chose to use DALL-E) Generates an image from text using OpenAI's DALL-E. | Your prompt and number of images to generate (limited to 4). |
| `/img2img` | Generates an image using an input image and a prompt. | The model you want to use and your input image. After submitting, shows a pop up with further options. |
| `/text2img` | Generates an image using a prompt. | The model you want to use. After submitting, shows a pop up with further options. |

### What options does the pop up have for `/img2img` and `/text2img?`

![image of pop up prompt](https://github.com/zer0ney/LilScotch/blob/c9aa8423c78cafe393d4fbe48e0e21ee18cf0daa/screenshots/popup-prompt.png)

### How do I join my bot to a server?

You can follow the steps on the Discord.js Guide page [here.](https://discordjs.guide/preparations/adding-your-bot-to-servers.html#bot-invite-links)

### How can I keep the webui and the bot running at the same time?

If you're on Linux, look into PM2 or tmux. For Windows, just run `webui.bat` and then open another terminal, navigate to your bot's folder and then start it.

### The bot isn't coming online! What's gone wrong?

Check the output in your console, and double triple check your fields in `.env` are all correct.

### I'm still having issues!

Get in touch with me on Discord at zer0ney#0025.
