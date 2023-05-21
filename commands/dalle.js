const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { Configuration, OpenAIApi } = require('openai');
require('dotenv').config();

const configuration = new Configuration({
	apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

module.exports = {
	data: new SlashCommandBuilder()
		.setName('dalle')
		.setDescription('Takes a prompt and generates an image using OpenAI\'s DALL-E.')
		.addStringOption(option =>
			option
				.setName('prompt')
				.setDescription('Prompt for image generation.')
				.setRequired(true),
		)
		.addIntegerOption(option =>
			option
				.setName('num')
				.setDescription('Number of images to generate.')
				.setRequired(true)
				.setMaxValue(4)
				.setMinValue(1),
		),
	async execute(interaction) {

		if (interaction.channelId != process.env.DISCORD_CHANNEL_ID) {
			return await interaction.reply({ content: `Wrong channel! Head to <#${process.env.DISCORD_CHANNEL_ID}> and try again there.`, ephemeral: true });
		}

		await interaction.deferReply();

		// image(s) from openai will go into this object
		const response = await getImage(interaction.options.getString('prompt'), interaction.options.getInteger('num'));

		if (response.error) {
			if (response.data.error.message.includes('safety system.')) {
				return await interaction.editReply(`Whoops, looks like that prompt was caught by OpenAI's safety system. Try another one. Prompt was: ${interaction.options.getString('prompt')}`);
			}
			return await interaction.editReply(`Error creating image! Status ${response.status}, ${response.data.error.message}`);
		}

		const images = [];
		images['embed'] = [];
		images['attachments'] = [];

		for (const image of response) {
			// just naming the file something random. name required for the embed to pick up the attachments and smoosh them together
			const imagename = `${Math.floor(Math.random() * 9999999999)}.png`;
			const attach = new AttachmentBuilder()
				.setFile(image.url)
				.setName(imagename);

			// all the embeds will show up together in the same message if the URL is set the same. funny gif :)
			const embed = new EmbedBuilder().setURL('https://cdn.discordapp.com/attachments/990567237071015946/990567769537937428/ezgif.com-gif-maker.gif')
				.setImage(`attachment://${imagename}`)
				.setDescription(`Prompt: ${interaction.options.getString('prompt')}`)
				.setFooter({ text: `Requested by ${interaction.user.tag}` })
				.setTimestamp();
			images.embed.push(embed);
			images.attachments.push(attach);
		}

		await interaction.editReply({ embeds: images.embed, files: images.attachments });
	},
};

async function getImage(prompt, num) {
	try {
		const response = await openai.createImage({
			prompt: prompt,
			n: num,
			size: '1024x1024',
		});

		return await response.data.data;

	} catch (error) {
		if (error.response) {
			const response = [];

			response['status'] = error.response.status;
			response['error'] = true;
			response['data'] = error.response.data;

			return await response;
		}
	}
}