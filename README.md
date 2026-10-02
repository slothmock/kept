# Kept

**Save toward something. Keep your commitments. Earn more for following through.**

Kept is a behavioural savings app built on [Monad](https://www.monad.xyz/).

It helps users save toward goals, choose predefined real-world commitments, and earn additional rewards when those commitments are completed.

## How it works

Users create a savings goal, add money, choose a commitment, complete it, and provide whatever proof that commitment requires. Savings earn base yield independently, while completed commitments can qualify for additional bounded rewards. Missing a commitment does not remove legitimately earned base yield or affect ownership of the user's savings.

## Stack & integrations

Kept currently uses:

- [React](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Vite](https://vite.dev/) and [Tailwind CSS](https://tailwindcss.com/) for the web app
- [Node.js](https://nodejs.org/), [Fastify](https://fastify.dev/) and [PostgreSQL](https://www.postgresql.org/) for the API
- [Solidity](https://soliditylang.org/) and [Foundry](https://getfoundry.sh/) for smart contracts
- [Monad](https://www.monad.xyz/) for settlement
- [Aave V3](https://aave.com/) for the underlying savings strategy
- [Privy](https://www.privy.io/) for authentication, embedded wallets and transaction infrastructure
- [Aurora Intents](https://intents.aurora.dev/) for cross-chain funding

## Hackathon

Kept is being built for the **Monad Metropolis** hackathon, with **Consumer Products & Payments** as the intended primary track.

## Development status

Kept is under active development.

Right now, the focus is getting the main user flows working end to end, including savings, goals, commitments, rewards, cross-chain funding, withdrawals, and staging deployment.

Kept is still experimental financial software and has not been production-audited.

## License

No license has been selected yet.

For now, the source is publicly visible, but that doesn't grant permission to reuse, modify, or redistribute it.