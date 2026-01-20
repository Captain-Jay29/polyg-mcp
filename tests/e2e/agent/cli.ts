#!/usr/bin/env node
// CLI interface for the ReAct agent
import * as readline from 'node:readline';
import { MCPClient } from './mcp-client.js';
import { ReActAgent } from './react-agent.js';
import type { AgentConfig } from './types.js';

interface CLIOptions {
  serverUrl: string;
  model: string;
  apiKey: string;
  maxSteps: number;
  verbose: boolean;
  interactive: boolean;
  query?: string;
}

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const options: CLIOptions = {
    serverUrl: process.env.POLYG_SERVER_URL ?? 'http://localhost:4000',
    model: process.env.POLYG_AGENT_MODEL ?? 'gpt-4o-mini',
    apiKey: process.env.OPENAI_API_KEY ?? '',
    maxSteps: 10,
    verbose: false,
    interactive: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--server':
      case '-s':
        options.serverUrl = args[++i] ?? options.serverUrl;
        break;
      case '--model':
      case '-m':
        options.model = args[++i] ?? options.model;
        break;
      case '--api-key':
      case '-k':
        options.apiKey = args[++i] ?? options.apiKey;
        break;
      case '--max-steps':
        options.maxSteps = Number.parseInt(args[++i] ?? '10', 10);
        break;
      case '--verbose':
      case '-v':
        options.verbose = true;
        break;
      case '--interactive':
      case '-i':
        options.interactive = true;
        break;
      case '--query':
      case '-q':
        options.query = args[++i];
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
polyg-mcp E2E Test Agent

Usage: tsx tests/e2e/agent/cli.ts [options]

Options:
  -s, --server <url>      MCP server URL (default: http://localhost:4000)
  -m, --model <model>     OpenAI model to use (default: gpt-4o-mini)
  -k, --api-key <key>     OpenAI API key (or set OPENAI_API_KEY env var)
  --max-steps <n>         Maximum reasoning steps (default: 10)
  -v, --verbose           Show detailed reasoning steps
  -i, --interactive       Interactive mode (REPL)
  -q, --query <query>     Run a single query and exit
  -h, --help              Show this help message

Environment Variables:
  POLYG_SERVER_URL        MCP server URL
  POLYG_AGENT_MODEL       OpenAI model
  OPENAI_API_KEY          OpenAI API key

Interactive Commands:
  tools                   List available MCP tools
  reconnect               Reconnect with a fresh session
  verbose                 Toggle verbose reasoning output
  exit                    Exit the agent

Examples:
  # Interactive mode
  tsx tests/e2e/agent/cli.ts -i -v

  # Single query
  tsx tests/e2e/agent/cli.ts -q "What caused the auth service failure?"

  # With custom server
  tsx tests/e2e/agent/cli.ts -s http://localhost:3000 -i
`);
}

function runInteractive(
  agent: ReActAgent,
  mcpClient: MCPClient,
  verbose: boolean,
): Promise<void> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log('\n🤖 polyg-mcp E2E Test Agent');
    console.log(
      'Type your query, or use commands: tools, reconnect, verbose, help, exit\n',
    );

    let isVerbose = verbose;

    const prompt = (): void => {
      rl.question('> ', async (input) => {
        const trimmed = input.trim();

        if (!trimmed) {
          prompt();
          return;
        }

        // Handle commands (with or without leading slash)
        const command = trimmed.startsWith('/') ? trimmed.slice(1) : trimmed;
        if (
          ['tools', 'reconnect', 'verbose', 'exit', 'quit', 'help'].includes(
            command,
          )
        ) {
          switch (command) {
            case 'tools': {
              const tools = mcpClient.getTools();
              console.log(`\nAvailable tools (${tools.length}):`);
              if (tools.length === 0) {
                console.log('  (no tools found - try reconnecting)');
              }
              for (const tool of tools) {
                const desc = tool.description || '(no description)';
                console.log(`  - ${tool.name}: ${desc}`);
              }
              console.log('');
              break;
            }
            case 'reconnect':
              console.log('Reconnecting to server...');
              try {
                await mcpClient.reconnect();
                console.log(
                  `Reconnected! Found ${mcpClient.getTools().length} tools available.\n`,
                );
              } catch (error) {
                console.error(
                  `Failed to reconnect: ${error instanceof Error ? error.message : String(error)}\n`,
                );
              }
              break;
            case 'verbose':
              isVerbose = !isVerbose;
              console.log(`Verbose mode: ${isVerbose ? 'ON' : 'OFF'}\n`);
              break;
            case 'exit':
            case 'quit':
              console.log('Goodbye!');
              rl.close();
              resolve(); // Resolve the promise when user exits
              return;
            case 'help':
              console.log('\nCommands:');
              console.log('  tools     - List available MCP tools');
              console.log('  reconnect - Reconnect with a fresh session');
              console.log('  verbose   - Toggle verbose reasoning output');
              console.log('  exit      - Exit the agent\n');
              break;
          }
          prompt();
          return;
        }

        // Run query
        try {
          // Temporarily update agent config for verbose
          const originalVerbose = agent.getVerbose();
          agent.setVerbose(isVerbose);

          const result = await agent.run(trimmed);

          agent.setVerbose(originalVerbose);

          if (!isVerbose) {
            console.log(`\n${result.answer}\n`);
          }

          console.log(
            `[Tools used: ${result.toolsUsed.join(', ') || 'none'} | Steps: ${result.totalSteps}]\n`,
          );
        } catch (error) {
          console.error(
            `Error: ${error instanceof Error ? error.message : String(error)}\n`,
          );
        }

        prompt();
      });
    };

    prompt();
  });
}

async function main(): Promise<void> {
  const options = parseArgs();

  if (!options.apiKey) {
    console.error('Error: OpenAI API key is required');
    console.error('Set OPENAI_API_KEY environment variable or use --api-key');
    process.exit(1);
  }

  // Initialize MCP client
  const mcpClient = new MCPClient({ baseUrl: options.serverUrl });

  console.log(`Connecting to MCP server at ${options.serverUrl}...`);

  try {
    await mcpClient.connect();
    console.log(
      `Connected! Found ${mcpClient.getTools().length} tools available.`,
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`Failed to connect to MCP server: ${errorMsg}`);

    // Provide helpful error messages based on the error type
    if (errorMsg.includes('SESSION_NOT_FOUND')) {
      console.error(
        '\nSession expired or invalid. A new session will be created on reconnect.',
      );
    } else if (errorMsg.includes('SESSION_LIMIT')) {
      console.error(
        '\nServer has reached maximum session limit. Try again later or restart the server.',
      );
    } else if (
      errorMsg.includes('ECONNREFUSED') ||
      errorMsg.includes('fetch failed')
    ) {
      console.error('\nMake sure the polyg-mcp server is running:');
      console.error(
        '  cd packages/server && PORT=4000 POLYG_MODE=http pnpm dev',
      );
    } else {
      console.error('\nUnexpected error. Check server logs for details.');
    }
    process.exit(1);
  }

  // Initialize agent
  const agentConfig: AgentConfig = {
    model: options.model,
    apiKey: options.apiKey,
    maxSteps: options.maxSteps,
    verbose: options.verbose,
  };

  const agent = new ReActAgent(mcpClient, agentConfig);

  try {
    if (options.query) {
      // Single query mode
      const result = await agent.run(options.query);

      if (!options.verbose) {
        console.log(`\nAnswer: ${result.answer}`);
      }

      console.log(`\nTools used: ${result.toolsUsed.join(', ') || 'none'}`);
      console.log(`Total steps: ${result.totalSteps}`);
      console.log(`Success: ${result.success}`);
    } else if (options.interactive) {
      // Interactive mode
      await runInteractive(agent, mcpClient, options.verbose);
    } else {
      // No query provided, show help
      console.log(
        '\nNo query provided. Use -q for single query or -i for interactive mode.',
      );
      printHelp();
    }
  } finally {
    await mcpClient.disconnect();
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
