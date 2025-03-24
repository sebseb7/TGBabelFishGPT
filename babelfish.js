import TelegramBot from "node-telegram-bot-api";
import { File } from "node:buffer";
import OpenAI from "openai";

const bot = new TelegramBot('xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', {polling: true});
const openai = new OpenAI({apiKey: "yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy"});

const language = {};
const voice = {};
			
async function process(chatId,text) 
{
	bot.sendChatAction(chatId, 'typing');
	const completion = await openai.chat.completions.create({ 
		model: "gpt-4o-mini", 
		stream: false, 
		messages: [ 
			{ role: "system", content: [ { type: "text", text: 'You are Babelfish the translator. Detect whether your name was called.' }]}, 
			{ role: "user", content: [{ type: "text", text: text }] }
		],
		response_format: {"type":"json_schema","json_schema":{"name":"output","strict":true,"schema":{"type":"object","properties":{
			"babelfish_was_called":{"type":"boolean","description":"Detect whether Babelfish was called."},
			"language_to_translate_to":{"type":"string","description":"The Language you was asked to translate to"},
			"voice_output":{"type":"boolean","description":"Enable Voice Output"},
		},"required":["babelfish_was_called","language_to_translate_to","voice_output"],"additionalProperties":false}}}
	});
	const aires = JSON.parse(completion.choices[0].message.content);

	if(aires.babelfish_was_called){
		voice[chatId]=aires.voice_output;
		language[chatId]=aires.language_to_translate_to;
		bot.sendMessage(chatId, "✅ "+language[chatId]+" "+(voice[chatId]?' ✅ audio':''));
	}else{
		const completion = await openai.chat.completions.create({ 
			model: "gpt-4o-mini", 
			stream: false, 
			messages: [ 
				{ role: "system", content: [ { type: "text", text: 'You are Babelfish. You translate to '+language[chatId] }]}, 
				{ role: "user", content: [{ type: "text", text: text }] }
			]
		});
		bot.sendMessage(chatId,completion.choices[0].message.content);
		if(voice[chatId]){
			bot.sendChatAction(chatId, 'record_audio');
			const mp3 = await openai.audio.speech.create({
				model: "gpt-4o-mini-tts", voice: "onyx",
				input: completion.choices[0].message.content
			});
			const buffer = Buffer.from(await mp3.arrayBuffer());
			bot.sendVoice(chatId,buffer);
		}
	}
}


bot.on('message', (msg)=>{
	const chatId = msg.chat.id;

	if(msg.voice){
		const stream = bot.getFileStream(msg.voice.file_id);
		const bufs = [];
		stream.on('data', (d) => { bufs.push(d) });
		stream.on('end', async () => {
			const audioFile = new File(bufs, "audio.ogg", {type: "audio/ogg"});
			bot.sendChatAction(chatId, 'typing');
			const transcriptions = await openai.audio.transcriptions.create({ file: audioFile,model: "whisper-1" });
			bot.sendMessage(chatId,transcriptions.text)
			process(chatId,transcriptions.text);
		});
	}

	if(msg.text) process(chatId,msg.text);

	if(!language[chatId]) bot.sendMessage(chatId, "Welche Sprache? (Sprachausgabe ja/nein?)");
});

