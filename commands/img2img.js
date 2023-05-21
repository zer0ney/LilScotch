const { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { request, fetch } = require('undici');
require('dotenv').config();

module.exports = {
	data: new SlashCommandBuilder()
		.setName('img2img')
		.setDescription('Image to image using a prompt. Can choose models and adjust parameters freely.')
		.addStringOption(option =>
			option
				.setName('model')
				.setDescription('The model to use. Look them up for examples.')
				.setRequired(true)
				.addChoices(
					{ name: 'Stable Diffusion 2.1', value: 'Stable Diffusion 2.1' },
					{ name: 'DreamShaper', value: 'DreamShaper' },
					{ name: 'Realism', value: 'Realism' },
				),
		)
		.addAttachmentOption(option =>
			option
				.setName('image')
				.setDescription('The image to base your new image from.')
				.setRequired(true),
		),
	async execute(interaction) {
		if (interaction.channelId != process.env.DISCORD_CHANNEL_ID) {
			return await interaction.reply({ content: `Wrong channel! Head to ${process.env.DISCORD_CHANNEL_ID} and try again there.`, ephemeral: true });
		}

		// we need to define image and model here, since the modal interaction is a completely different interaction and wont have any image data
		const model = interaction.options.getString('model');
		const inputImage = interaction.options.getAttachment('image');

		// now we need to make sure image is either jpg or png
		if (!(inputImage.contentType == 'image/jpeg' || inputImage.contentType == 'image/png')) {
			return await interaction.reply({ content: `Looks like that wasn't a PNG or JPEG, try submitting again.`, ephemeral: true });
		}

		// modals cap out at 5 entries so we can't enter any more options here sadly.
		// we could technically show another modal but lot of effort for users that will just leave options at default
		const advancedModal = new ModalBuilder()
			.setCustomId(`advancedModal`)
			.setTitle('Advanced Options');

		const promptInput = new TextInputBuilder()
			.setCustomId('promptInput')
			.setLabel('Prompt')
			.setPlaceholder('Prompt to generate a picture from.')
			.setStyle(TextInputStyle.Paragraph)
			.setRequired(true)
			.setMaxLength(1000);

		const negPromptInput = new TextInputBuilder()
			.setCustomId('negPromptInput')
			.setLabel('Negative Prompt')
			.setPlaceholder('Negative prompt - stuff you don\'t want to see in your image.')
			.setStyle(TextInputStyle.Paragraph)
			.setRequired(false)
			.setMaxLength(1000);

		const cfgScaleInput = new TextInputBuilder()
			.setCustomId('cfgScaleInput')
			.setLabel('CFG scale')
			.setPlaceholder('Between 1 and 30. Default is 8.')
			.setStyle(TextInputStyle.Short)
			.setRequired(false);

		const samplerInput = new TextInputBuilder()
			.setCustomId('samplerInput')
			.setLabel('Sampler')
			.setPlaceholder('LMS, Euler a, Euler or DPM2. Default is Euler a.')
			.setStyle(TextInputStyle.Short)
			.setRequired(false);

		const stepsInput = new TextInputBuilder()
			.setCustomId('stepsInput')
			.setLabel('Steps')
			.setPlaceholder('Between 1 and 100. Default is 50.')
			.setStyle(TextInputStyle.Short)
			.setRequired(false);

		const promptInputRow = new ActionRowBuilder().addComponents(promptInput);
		const negPromptInputRow = new ActionRowBuilder().addComponents(negPromptInput);
		const cfgScaleInputRow = new ActionRowBuilder().addComponents(cfgScaleInput);
		const samplerInputRow = new ActionRowBuilder().addComponents(samplerInput);
		const stepsInputRow = new ActionRowBuilder().addComponents(stepsInput);

		advancedModal.addComponents(promptInputRow, negPromptInputRow, cfgScaleInputRow, samplerInputRow, stepsInputRow);

		await interaction.showModal(advancedModal);

		// get the modal submit interaction
		const modalInteraction = await interaction.awaitModalSubmit({
			// Timeout after 1 minute of not receiving any valid modals
			time: 60000,
			// make sure we only accept Modals from the User who sent the original Interaction we're responding to
			filter: i => i.user.id === interaction.user.id,
		}).catch(error => {
			// we want to catch the interaction error first specifically since it's not important
			if (error.message.includes('Collector received no interactions')) {
				return console.log(`Modal was not submitted for 1 minute, user ${interaction.user.username} may have closed modal. You can safely ignore this message.`);
			}

			console.error(error);
			return null;
		});

		if (modalInteraction) {
			await modalInteraction.deferReply();
			// modal received, now we need to confirm the fields are correct.
			// we need to pass some of these values through as ints and set defaults if nothing was put in
			// we also need to get the model selected from the custom id by splitting it
			const prompt = modalInteraction.fields.getTextInputValue('promptInput');
			const negPrompt = modalInteraction.fields.getTextInputValue('negPromptInput');
			let cfgScale;
			let sampler;
			let steps;

			if (modalInteraction.fields.getTextInputValue('cfgScaleInput') == '') {
				cfgScale = 8;
			} else {
				cfgScale = parseInt(modalInteraction.fields.getTextInputValue('cfgScaleInput'));
			}

			if (modalInteraction.fields.getTextInputValue('samplerInput') == '') {
				sampler = 'Euler a';
			} else {
				sampler = modalInteraction.fields.getTextInputValue('samplerInput');
			}

			if (modalInteraction.fields.getTextInputValue('stepsInput') == '') {
				steps = 50;
			} else {
				steps = parseInt(modalInteraction.fields.getTextInputValue('stepsInput'));
			}

			// we've got our values now, time to check em
			// we need to make sure cfg scale is between 1 and 30 and an integer
			if ((cfgScale < 1) || (cfgScale > 30) || !(Number.isInteger(cfgScale))) {
				return await modalInteraction.editReply({ content: `CFG scale ${cfgScale} not valid. Needs to be between 1 and 30.` });
			}

			// need to make sure sampler is one of lms, euler a, euler or dpm2
			if (!(sampler.toLowerCase()).match(/^(lms|euler a|euler|dpm2)$/)) {
				return await modalInteraction.editReply({ content: `Sampler ${sampler} not valid. Specify LMS, Euler a, Euler or DPM2.` });
			}

			// steps between 1 and 100 and also an integer
			if ((steps < 1) || (steps > 100) || !(Number.isInteger(steps))) {
				return await modalInteraction.editReply({ content: `Steps ${steps} not valid. Needs to be between 1 and 100.` });
			}

			const loadedModel = (modalInteraction.client.user.presence.activities[0].toString()).split(': ')[1];

			if (loadedModel != model) {
				await modalInteraction.editReply({ content: `Switching models, might take a minute...` });
			}

			// set model status - doing this right away means new commands that come through can see it
			modalInteraction.client.user.setActivity(`Model currently loaded: ${model}`);

			// looks like everything is chill, get our input image formatted into base64. lots of converting.

			const inputImgObj = await fetch(inputImage.url, { encoding: null });
			const inputImgBlob = await inputImgObj.blob();
			const inputImgArrayBuff = await inputImgBlob.arrayBuffer();
			const inputImgBase64 = await base64ArrayBuffer(inputImgArrayBuff);

			const imageResponse = await getImage(prompt, negPrompt, model, cfgScale, sampler, steps, inputImgBase64);

			const images = [];
			images.push(new Buffer.from(await imageResponse.images[0], 'base64'));
			images.push(new Buffer.from(await imageResponse.parameters.init_images[0], 'base64'));

			// building a details object for the final message
			const details = new Object();
			details.model = model;
			details.cfgScale = cfgScale;
			details.sampler = sampler;
			details.steps = steps;
			details.originalImage = inputImage.url;

			// now we go and send our image. this definitely doesnt need to be in a function but it looks a lot nicer.
			return await sendImages(images, prompt, negPrompt, modalInteraction.user.tag, modalInteraction, details);
		}
	},
};

async function getImage(prompt, negPrompt, model, cfgScale, sampler, steps, inputImg) {

	let width;
	let height;

	if (model == 'Stable Diffusion 2.1') {
		model = 'stable-diffusion-v2-1';
		// need to gen 768 with 2.1.
		width = 768;
		height = 768;
	} else if (model == 'DreamShaper') {
		model = 'dreamshaper';
		width = 512;
		height = 512;
	} else if (model == 'Realism') {
		model = 'realismEngine';
		width = 512;
		height = 512;
	}

	const options = new Object();
	options.init_images = [inputImg];
	// we want to send the original image back as well for easy comparison
	options.include_init_images = true;
	options.prompt = prompt;
	options.negative_prompt = negPrompt;
	options.cfg_scale = cfgScale;
	options.sampler_name = sampler;
	options.steps = steps;
	options.width = width;
	options.height = height;
	options.send_images = true;
	options.override_settings_restore_afterwards = false;
	// we want the last selected model to stay loaded just in case the next person uses the same model. decent speed increase if so.

	options.enable_hr = true;
	options.hr_scale = 2;
	options.hr_resize_x = 1024;
	options.hr_resize_y = 1024;
	options.hr_upscaler = 'ESRGAN_4x';

	// need to also build our override settings for the model
	options.override_settings = new Object();
	options.override_settings.sd_model_checkpoint = model;

	const req = await request(`${process.env.STABLEDIFF_URL}/sdapi/v1/img2img`, {
		method: 'POST',
		body: JSON.stringify(options),
	});

	const result = await req.body.json();

	console.log(result);

	return result;
}

async function sendImages(images, prompt, negPrompt, user, interaction, details) {
	const message = [];
	message['embed'] = [];
	message['attachments'] = [];

	for (const image of images) {
		/*
		to get multiple images in the same embed they need separate embeds but to have to same:
		- file name
		- embed url
		- embed attachment name
		then discord does some magic (????) and they show up in the same embed.
		*/
		const imagename = `${Math.floor(Math.random() * 9999999999)}.png`;

		const attachment = new AttachmentBuilder()
			.setFile(image)
			.setName(imagename);

		const embed = new EmbedBuilder()
			// url is set to funny gif. feel free to change it if you'd like
			.setURL(details.originalImage)
			.setImage(`attachment://${imagename}`)
			.setTitle(`${details.model}`)
			.addFields(
				{ name: 'Prompt:', value: prompt },
				{ name: 'Negative Prompt:', value: negPrompt != '' ? negPrompt : 'None' },
				{ name: 'CFG Scale:', value: details.cfgScale.toString(), inline: true },
				{ name: 'Sampler:', value: details.sampler, inline: true },
				{ name: 'Steps:', value: details.steps.toString(), inline: true },
			)
			.setFooter({ text: `Requested by ${user}` })
			.setTimestamp();
		message.embed.push(embed);
		message.attachments.push(attachment);
	}

	return await interaction.editReply({ embeds: message.embed, files: message.attachments, content: '' });
}

// ripped from https://gist.github.com/jonleighton/958841, many thanks!
async function base64ArrayBuffer(arrayBuffer) {
	let base64 = '';
	const encodings = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

	const bytes = new Uint8Array(arrayBuffer);
	const byteLength = bytes.byteLength;
	const byteRemainder = byteLength % 3;
	const mainLength = byteLength - byteRemainder;

	let a, b, c, d;
	let chunk;

	// Main loop deals with bytes in chunks of 3
	for (let i = 0; i < mainLength; i = i + 3) {
		// Combine the three bytes into a single integer
		chunk = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];

		// Use bitmasks to extract 6-bit segments from the triplet
		a = (chunk & 16515072) >> 18;
		b = (chunk & 258048) >> 12;
		c = (chunk & 4032) >> 6;
		d = chunk & 63 ;

		// Convert the raw binary segments to the appropriate ASCII encoding
		base64 += encodings[a] + encodings[b] + encodings[c] + encodings[d];
	}

	// Deal with the remaining bytes and padding
	if (byteRemainder == 1) {
		chunk = bytes[mainLength];

		a = (chunk & 252) >> 2;

		// Set the 4 least significant bits to zero
		b = (chunk & 3) << 4;

		base64 += encodings[a] + encodings[b] + '==';
	} else if (byteRemainder == 2) {
		chunk = (bytes[mainLength] << 8) | bytes[mainLength + 1];

		a = (chunk & 64512) >> 100;
		b = (chunk & 1008) >> 4;

		// Set the 2 least significant bits to zero
		c = (chunk & 15) << 2;

		base64 += encodings[a] + encodings[b] + encodings[c] + '=';
	}

	return base64;
}