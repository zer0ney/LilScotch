const { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { request } = require('undici');
require('dotenv').config();

module.exports = {
	data: new SlashCommandBuilder()
		.setName('text2img')
		.setDescription('Text to image locally. Can choose models and adjust parameters freely.')
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
		),
	async execute(interaction) {
		if (interaction.channelId != process.env.DISCORD_CHANNEL_ID) {
			return await interaction.reply({ content: `Wrong channel! Head to <#${process.env.DISCORD_CHANNEL_ID}> and try again there.`, ephemeral: true });
		}

		// modals cap out at 5 entries so we can't enter any more options here sadly.
		// we could technically show another modal but lot of effort for users that will just leave options at default
		const advancedModal = new ModalBuilder()
			.setCustomId(`advancedModal|${interaction.options.getString('model')}`)
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
			// Timeout after 2 minutes of not receiving any valid modals
			time: 120000,
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
			const model = (modalInteraction.customId.split('|'))[1];
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

			// cheating and getting the current loaded model from presence. interactions are all separate.
			// we could absolutely store this in a db or something but whatever
			const loadedModel = (modalInteraction.client.user.presence.activities[0].toString()).split(': ')[1];

			if (loadedModel != model) {
				await modalInteraction.editReply({ content: `Switching models, might take a minute...` });
			}

			// set model status - doing this right away means new commands that come through can see it
			modalInteraction.client.user.setActivity(`Model currently loaded: ${model}`);

			// looks like everything is chill, send it to the function

			const imageResponse = await getImage(prompt, negPrompt, model, cfgScale, sampler, steps);

			const image = new Buffer.from(imageResponse.images[0], 'base64');

			// building a details object for the final message
			const details = new Object();
			details.model = model;
			details.cfgScale = cfgScale;
			details.sampler = sampler;
			details.steps = steps;

			return await sendImage(image, prompt, negPrompt, modalInteraction.user.tag, modalInteraction, details);
		}
	},
};

async function getImage(prompt, negPrompt, model, cfgScale, sampler, steps) {

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
	options.prompt = prompt;
	options.negative_prompt = negPrompt;
	options.cfg_scale = cfgScale;
	options.sampler_name = sampler;
	options.steps = steps;
	options.width = width;
	options.height = height;
	options.send_images = true;
	options.override_settings_restore_afterwards = false;
	// we want the last selected model to stay loaded just in case the next person uses the same model.

	options.enable_hr = true;
	options.hr_scale = 2;
	options.hr_resize_x = 1024;
	options.hr_resize_y = 1024;
	options.hr_upscaler = 'ESRGAN_4x';

	// need to also build our override settings for the model
	options.override_settings = new Object();
	options.override_settings.sd_model_checkpoint = model;

	const req = await request(`${process.env.STABLEDIFF_URL}/sdapi/v1/txt2img`, {
		method: 'POST',
		body: JSON.stringify(options),
	});

	const result = await req.body.json();

	return result;
}

async function sendImage(image, prompt, negPrompt, user, interaction, details) {
	const attachment = new AttachmentBuilder()
		.setFile(image)
		.setName('image.png');

	const embed = new EmbedBuilder()
		.setImage('attachment://image.png')
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

	return await interaction.editReply({ embeds: [embed], files: [attachment], content: '' });
}
