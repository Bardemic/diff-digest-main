import OpenAI from 'openai';

export async function POST(request: Request) {
    try {
        const {prompt, mode} = await request.json();
        const encoder = new TextEncoder();
        const stream = new TransformStream();
        const writer = stream.writable.getWriter();
        const client = new OpenAI({apiKey: process.env.OPENAI_API_KEY});

        const openAIstream = async () => {
            try {
                console.log(prompt)
                const marketingPrompt = 'You are an expert in marketing, yet are also relatively well versed in software development. You are given a diff from a merge Pull Request from github. Your goal is to generate notes from the diff, meant to be user-centric. Focus exclusively on the benefit of the change for the user. Use simple language, something an end user without swe experience could understand. Do NOT treat this like a conversation. Dont speak to anyone, simply state the notes. You are a computer, if you try treating this like a conversation instead of you simply getting the notes, your process will be terminated. Be concise with your words, use few adjectives. Every different feature must be organized, using "///" as bullet points. Dont use those anywhere else.'
                const developerPrompt = "You are a 100x developer, and are so GOATED that even Sam Altman looks up to you. Create concise and technical notes based on this diff from a merge pull request on github. Focus on the *what* and the *why* of the change. use semantic terms. Some good ones to use are Refactored, Fixed, added __ feature, etc."
                let finalPrompt = mode == "Marketing" ? marketingPrompt : developerPrompt;
                finalPrompt = finalPrompt +  "Do NOT treat this like a conversation. Dont speak to anyone, simply state the notes. You are a computer, if you try treating this like a conversation instead of you simply getting the notes, your process will be terminated. Be concise with your words, use few adjectives. Every different feature must be organized, using '///' as bullet points. Dont use those anywhere else.";
                const completion = await client.responses.create({
                    model: 'gpt-4.1-mini',
                    input: [
                        {role: "system", content: marketingPrompt},
                        {role: 'user', content: finalPrompt}],
                    stream: true,
                });
                console.log('ran')

                for await (const event of completion) {
                    if('delta' in event) {
                        console.log(event.delta);

                        if(event.delta) {
                            const message = `data: ${JSON.stringify({content: event.delta})}\n\n`
                            await writer.write(encoder.encode(message));
                        }
                    }

                }

                await writer.write(encoder.encode("data: [DONE]\n\n"));
                await writer.close();
            } catch (error) {
                const errorMessage = `data: ${JSON.stringify({error: error})}\n\n`;
                await writer.write(encoder.encode(errorMessage));
                await writer.close();
            }
        };

        openAIstream();

        return new Response(stream.readable, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache, no-transform',
                'Connection': 'keep-alive',
            }
        });
    } catch (error) {
        console.log('error:', error);
        return new Response(JSON.stringify({error: error}), {
            status: 500,
            headers: {
                'Content-Type': 'application/json'
            },
        });
    }
}