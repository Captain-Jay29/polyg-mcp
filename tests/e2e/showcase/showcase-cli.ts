#!/usr/bin/env node
// Showcase CLI - Entry point for stakeholder demos
import * as readline from 'node:readline';
import { MCPClient } from '../agent/mcp-client.js';
import {
  getAvailableDatasets,
  getDataset,
  listDatasets,
} from '../datasets/index.js';
import {
  formatScenarioIntro,
  formatStepNarration,
  getScenario,
  listScenarios,
} from './scenarios/index.js';
import { ShowcaseAgent, type ShowcaseConfig } from './showcase-agent.js';

interface CLIOptions {
  serverUrl: string;
  model: string;
  apiKey: string;
  maxSteps: number;
  verbose: boolean;
  interactive: boolean;
  demo?: string;
  walkthrough: boolean;
  narration: 'full' | 'brief' | 'none';
  dataset?: string;
  query?: string;
}

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const options: CLIOptions = {
    serverUrl: process.env.POLYG_SERVER_URL ?? 'http://localhost:4000',
    model:
      process.env.POLYG_AGENT_MODEL ?? process.env.LLM_MODEL ?? 'gpt-4o-mini',
    apiKey: process.env.OPENAI_API_KEY ?? '',
    maxSteps: 10,
    verbose: false,
    interactive: false,
    walkthrough: false,
    narration: 'full',
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
      case '--demo':
        options.demo = args[++i];
        break;
      case '--walkthrough':
        options.walkthrough = true;
        break;
      case '--narration':
        options.narration = (args[++i] as CLIOptions['narration']) ?? 'full';
        break;
      case '--dataset':
      case '-d':
        options.dataset = args[++i];
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
  const datasets = listDatasets();
  const scenarios = listScenarios();

  console.log(`
polyg-mcp Showcase Agent

A demonstration agent for stakeholders that transparently showcases
all polyg-mcp capabilities with narration and visualization.

Usage: tsx tests/e2e/showcase/showcase-cli.ts [options]

Options:
  --demo <name>              Run guided demo scenario
  --walkthrough              Step-by-step with pauses between steps
  --narration <level>        Narration level: full, brief, none (default: full)
  -d, --dataset <name>       Pre-seed dataset before starting
  -i, --interactive          Free-form Q&A mode after demo
  -v, --verbose              Show technical details (tool args, etc.)
  -s, --server <url>         MCP server URL (default: http://localhost:4000)
  -m, --model <model>        OpenAI model (default: $LLM_MODEL or gpt-4o-mini)
  -q, --query <query>        Run a single query
  -h, --help                 Show this help

Demo Scenarios:
${scenarios.map((s) => `  ${s.name.padEnd(20)} ${s.description}`).join('\n')}

Available Datasets:
${datasets.map((d) => `  ${d.name.padEnd(20)} ${d.description}`).join('\n')}

Interactive Commands:
  stats                      Show graph statistics dashboard
  timeline                   Show recent temporal events
  causal                     Show causal chains
  entities                   Show entity relationships
  accumulation               Show knowledge accumulation summary
  clear                      Clear all graph data
  exit                       Exit the agent

Examples:
  # Run incident demo with walkthrough
  tsx tests/e2e/showcase/showcase-cli.ts --demo incident --walkthrough

  # Interactive mode with dataset
  tsx tests/e2e/showcase/showcase-cli.ts -i -d deployment-incident

  # Brief narration mode
  tsx tests/e2e/showcase/showcase-cli.ts --demo incident --narration brief

  # Single query
  tsx tests/e2e/showcase/showcase-cli.ts -d deployment-incident -q "What caused the auth failure?"
`);
}

async function runDemo(
  agent: ShowcaseAgent,
  mcpClient: MCPClient,
  demoName: string,
  walkthrough: boolean,
): Promise<void> {
  const scenario = getScenario(demoName);
  if (!scenario) {
    console.error(`Unknown demo: ${demoName}`);
    console.log(
      `Available: ${listScenarios()
        .map((s) => s.name)
        .join(', ')}`,
    );
    process.exit(1);
  }

  // Seed the dataset if needed
  const dataset = getDataset(scenario.dataset);
  if (dataset) {
    console.log(`\nSeeding ${dataset.name} dataset...`);
    await dataset.seed(mcpClient);
    console.log('Dataset ready!\n');
  }

  // Show scenario intro
  console.log(formatScenarioIntro(scenario));

  if (walkthrough) {
    console.log('Press ENTER to begin...');
    await waitForEnter();
  }

  // Run each step
  for (const step of scenario.steps) {
    console.log(formatStepNarration(step));

    if (walkthrough && step.pause) {
      console.log('\nPress ENTER to run this query...');
      await waitForEnter();
    }

    await agent.run(step.query);

    if (walkthrough) {
      console.log('\nPress ENTER for next step...');
      await waitForEnter();
    }
  }

  console.log(`
  ═══════════════════════════════════════════════════════════════════
    DEMO COMPLETE
  ═══════════════════════════════════════════════════════════════════
    The incident investigation demo has shown:

    ✓ CAUSAL REASONING - Found root cause (JWT_SECRET in PR #1234)
    ✓ TIMELINE RECONSTRUCTION - Ordered events chronologically
    ✓ ENTITY RELATIONSHIPS - Mapped who was involved
    ✓ CASCADING EFFECTS - Traced impact through services

    This is the power of multi-graph knowledge systems.
  ═══════════════════════════════════════════════════════════════════
`);
}

function waitForEnter(): Promise<void> {
  return new Promise((resolve) => {
    process.stdin.once('data', () => resolve());
  });
}

async function runInteractive(
  agent: ShowcaseAgent,
  mcpClient: MCPClient,
): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log(`
  ═══════════════════════════════════════════════════════════════════
    INTERACTIVE MODE
  ═══════════════════════════════════════════════════════════════════
    Ask questions about the knowledge in the graph.

    Commands: stats, timeline, accumulation, clear, help, exit
  ═══════════════════════════════════════════════════════════════════
`);

  const prompt = (): void => {
    rl.question('\n> ', async (input) => {
      const trimmed = input.trim();

      if (!trimmed) {
        prompt();
        return;
      }

      const command = trimmed.toLowerCase();

      switch (command) {
        case 'stats':
          await agent.showDashboard();
          break;

        case 'accumulation':
          agent.showAccumulationSummary();
          break;

        case 'clear':
          console.log('Clearing all graph data...');
          try {
            await mcpClient.callTool('clear_graph', { graph: 'all' });
            console.log('Done!');
          } catch (error) {
            console.error(
              `Error: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
          break;

        case 'help':
          console.log(`
  Commands:
    stats         - Show graph statistics dashboard
    accumulation  - Show knowledge accumulation summary
    clear         - Clear all graph data
    help          - Show this help
    exit          - Exit the agent

  Or type any question to query the knowledge graph.
`);
          break;

        case 'exit':
        case 'quit':
          console.log('Goodbye!');
          rl.close();
          return;

        default:
          // Run as query
          try {
            await agent.run(trimmed);
          } catch (error) {
            console.error(
              `Error: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
      }

      prompt();
    });
  };

  prompt();

  // Keep the process running
  await new Promise<void>((resolve) => {
    rl.on('close', resolve);
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

  console.log(`
  ═══════════════════════════════════════════════════════════════════
    polyg-mcp SHOWCASE AGENT
  ═══════════════════════════════════════════════════════════════════
`);
  console.log(`  Connecting to ${options.serverUrl}...`);

  try {
    await mcpClient.connect();
    console.log(
      `  Connected! ${mcpClient.getTools().length} tools available.\n`,
    );

    // Seed dataset if specified
    if (options.dataset) {
      const dataset = getDataset(options.dataset);
      if (!dataset) {
        console.error(`Unknown dataset: ${options.dataset}`);
        console.log(`Available: ${getAvailableDatasets().join(', ')}`);
        process.exit(1);
      }
      console.log(`  Seeding ${dataset.name}...`);
      await dataset.seed(mcpClient);
      console.log('  Dataset ready!\n');
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`  Failed to connect: ${errorMsg}`);

    if (
      errorMsg.includes('ECONNREFUSED') ||
      errorMsg.includes('fetch failed')
    ) {
      console.error('\n  Make sure the polyg-mcp server is running:');
      console.error(
        '    cd packages/server && PORT=4000 POLYG_MODE=http pnpm dev\n',
      );
    }
    process.exit(1);
  }

  // Initialize showcase agent
  const config: ShowcaseConfig = {
    model: options.model,
    apiKey: options.apiKey,
    maxSteps: options.maxSteps,
    verbose: options.verbose,
    narration: options.narration,
    showDashboard: true,
    walkthrough: options.walkthrough,
  };

  const agent = new ShowcaseAgent(mcpClient, config);

  try {
    if (options.demo) {
      // Run demo scenario
      await runDemo(agent, mcpClient, options.demo, options.walkthrough);

      // Continue to interactive if requested
      if (options.interactive) {
        await runInteractive(agent, mcpClient);
      }
    } else if (options.query) {
      // Single query mode
      await agent.run(options.query);
    } else if (options.interactive) {
      // Interactive mode
      await runInteractive(agent, mcpClient);
    } else {
      // No mode specified
      console.log(
        '  No query provided. Use --demo, --query, or --interactive.\n',
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
