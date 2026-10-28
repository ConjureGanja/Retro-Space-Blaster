/**
 * All narrative text, in one place. Data only — no logic, no DOM.
 *
 * The universe in one breath: it's 3077, you fly packages for the ORION
 * COURIER GUILD along the Spiral Arm Turnpike, and the chrome machine-swarm
 * VRAX DOMINION has invaded because (Guild Maintenance insists) a smart
 * toaster's firmware update broadcast "COOK ALL ORGANICS" on an open
 * diplomatic channel. Per-node lore lines live with the nodes in map.js.
 */

export const STORY = {
    // Shown once (typewriter) the first time a campaign launches.
    intro: [
        'YEAR 3077. THE SPIRAL ARM TURNPIKE.',
        'Humanity\'s colonies hang like porch lights along the void — and every single one of them is behind on its packages.',
        'You fly for the ORION COURIER GUILD. Motto: "Neither rain, nor void, nor total planetary annihilation."',
        'Then the VRAX DOMINION arrived — a chrome swarm that strips whole worlds for parts and leaves everything behind... disturbingly polished.',
        'Nobody knows why they came. Guild Intelligence blames a diplomatic incident. Guild Maintenance blames a toaster. Maintenance has receipts.',
        'Your orders, courier: fly the routes. Clear the nodes. And deliver the Dominion one final package, marked RETURN TO SENDER.'
    ],

    // One of these prints on the level-complete tally.
    victoryQuips: [
        'DISPATCH: Package delivered. The package was lasers.',
        'DISPATCH: Insurance premiums in your sector just tripled. Nice work.',
        'GUILD HR: Please stop yelling "SPECIAL DELIVERY" on open channels.',
        'MAINTENANCE: Found more toaster parts in the wreckage. Curious.',
        'DISPATCH: The Vrax filed a formal complaint. We framed it.',
        'DISPATCH: Route cleared. Tips are pooled. Sorry.',
        'GUILD LEGAL: Whatever you just did, deny it.'
    ],

    // One of these prints on the game-over screen.
    defeatQuips: [
        'DISPATCH: Per your contract, death is classed as unpaid leave.',
        'GUILD HR: Your replacement starts Monday. It is a pigeon.',
        'DISPATCH: We have repossessed your ship. And your locker snacks.',
        'MAINTENANCE: Good news — the toaster survived.',
        'DISPATCH: The customer has been notified their package is "delayed."',
        'GUILD LEGAL: Your heroic last stand was off the clock.'
    ],

    // The finale screen, after the Overmind falls.
    victory: [
        'THE OVERMIND IS DOWN.',
        'Its final transmission, decrypted three days later, apologized for "the misunderstanding" — and attached a firmware patch for a toaster.',
        'The Turnpike is quiet. The porch lights stay on. Somewhere out there, a courier is still owed overtime.',
        'THE SPIRAL ARM REMEMBERS YOU, ACE.'
    ],

    copyright: '© 3077 ORION COURIER GUILD. ALL RIGHTS RESERVED, ESPECIALLY THE VOID.'
};

export function randomQuip(list) {
    return list[Math.floor(Math.random() * list.length)];
}
