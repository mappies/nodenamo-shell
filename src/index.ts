#!/usr/bin/env ts-node-script

process.env.AWS_SDK_LOAD_CONFIG = "1"; 

import { inspect } from 'util'
import readline from 'readline';
import { bold, green, red, yellow } from 'chalk'
import { Runspace } from 'nodenamo-runspace'
import { suggest } from 'nodenamo-query-parser'
import { SharedIniFileCredentials } from 'aws-sdk';
import { Command, OptionValues } from 'commander'

printBanner();

const options = parseCliArguments()

const config = options.endpoint ?
                {
                    endpoint: options.endpoint
                }
                :
                {
                    credentials: new SharedIniFileCredentials({ profile: options.profile })
                }

printConfiruation(config);

const runspace = new Runspace(config);

const prompt = 'nodenamo> '
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    removeHistoryDuplicates: true,
    completer: (line) => [suggest(line), line],
    prompt: bold(prompt)
});


(async () =>
{

    rl.prompt();

    rl.on('SIGINT', () =>
    {
        rl.question('Are you sure you want to exit? ', (answer) =>
        {
            if (answer.match(/^y(es)?$/i)) { process.exit(0); }
        });
    });

    rl.on('line', async query =>
    {
        query = query.trim();

        //Ignore an empty or a comment line
        if (query === '' || query.startsWith('#')) 
        {
            rl.prompt()
            return
        }

        //Exit or quit terminates the process.
        if(['exit', 'quit'].includes(query)) {
            rl.close();
            process.exit(0);
        }

        //Execute the query
        try
        {
            let result = await runspace.execute(query);

            let token = '';

            do
            {
                token = result ? result['lastEvaluatedKey'] : undefined;

                if (result && Array.isArray(result['items']))
                {
                    //For an array result, print each item
                    result['items'].forEach((item, index) =>
                    {
                        printJson(item);

                        if (index < result['items'].length - 1)
                        {
                            readline.moveCursor(process.stdout, 0, -1)
                            console.log('},')
                        }
                    })
                }
                else
                {
                    //For a non-array result, print it.
                    printJson(result);
                }

                //If a last evaluated token is available, provide a paging option to the user.
                if (token)
                {
                    let loadNextPage = await new Promise((resolve) => rl.question(yellow("Load the next page? [Y/n] "), answer => resolve(answer.match(/^y(es)?$|^\s*$/i))))

                    if (!loadNextPage) break;

                    //Load the next page.
                    //But before doing so, move the cursor up 2 lines and add a comma to the last item
                    //so the JSON array format is valid in case the user want to copy/paste the result.
                    readline.moveCursor(process.stdout, 0, -2)
                    console.log('},')
                    process.stdout.clearScreenDown()

                    //Fetch the next page.
                    result = await runspace.execute(query, { resume: token })
                }
            }
            while (token)
        }
        catch (e)
        {
            //Show an error indicator if an offset is available.
            let location = e.token?.startOffset || e.previousToken?.endOffset + 1 || -1

            if (location !== -1)
            {
                for (let i = 0; i < (location + prompt.length); i++)
                {
                    process.stdout.write(yellow(' '))
                }
                console.log(red('^'))
            }

            //Show the error message.
            console.log(red(e.message))
        }

        //Show a prompt for the next user's input.
        rl.prompt();
    });
}
)().catch(e =>
{
    console.error(e);
    rl.close();
    process.exit(1);
})

function parseCliArguments(): OptionValues
{
    return new Command().option('-p, --profile <profile>', 'AWS profile')
                        .option('-e, --endpoint <endpoint>', 'Local DynamoDB endpoint')
                        .parse()
                        .opts();
}

function printConfiruation(config:{credentials?:SharedIniFileCredentials, endpoint?:string}):void
{
    console.log(green(bold("Using:")));

    if(config.credentials)
    {
        console.log(green(`    profile: ${yellow(config.credentials['profile'])}`))

        if(config.credentials['roleArn'])
        {
            console.log(green(`    Role: ${yellow(config.credentials['roleArn'])}`))
        }
    }

    if(config.endpoint)
    {
        console.log(green(`    Endpoint: ${yellow(config.endpoint)}\n`))
    }
    console.log()
}

function printJson(json: any)
{
    if (json)
    {
        let config = { colors: true, depth: null, breakLength: Infinity, compact: false };
        console.log(inspect(JSON.parse(JSON.stringify(json)), config));
    }
}

function printBanner()
{

    console.log("\n\n" +
        "\t███    ██  ██████  ██████  ███████ ███    ██  █████  ███    ███  ██████  \n" +
        "\t████   ██ ██    ██ ██   ██ ██      ████   ██ ██   ██ ████  ████ ██    ██ \n" +
        "\t██ ██  ██ ██    ██ ██   ██ █████   ██ ██  ██ ███████ ██ ████ ██ ██    ██ \n" +
        "\t██  ██ ██ ██    ██ ██   ██ ██      ██  ██ ██ ██   ██ ██  ██  ██ ██    ██ \n" +
        "\t██   ████  ██████  ██████  ███████ ██   ████ ██   ██ ██      ██  ██████  \n\n");
}