# Game mechanics

Code that defines and runs Dimensions Freelancer's behaviour: combat rules, abilities, AI, encounters, venue life, crowds, story and missions. A mechanic is a system with `updateState()` or phase hooks, registered with the Lobby's runtime; it never runs its own loop. When data names a behaviour (for example `"behaviour": "vending_machine"`), the mechanic is registered here under that name.
