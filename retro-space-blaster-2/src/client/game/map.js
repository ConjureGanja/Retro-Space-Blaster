/**
 * The campaign star map: node/route data plus persistent campaign state
 * (unlocks, best grades, victory). Screen rendering lives in ui.js; this
 * module owns the data and the rules.
 *
 * Node schema:
 *   id, name, zone, x/y (percent position on the map area), sector (feeds the
 *   existing per-level scaling), type (label), unlockedBy (route prereqs),
 *   secretOf { node, grade } (hidden until that node is beaten at that grade),
 *   reward ('upgrade' = free upgrade pick on completion),
 *   lore (briefing line), mods:
 *     lengthMult    — scales the run length
 *     noBoss        — node auto-completes at 100% progress (no mothership)
 *     noMiniboss    — no dreadnought ambush
 *     bossRush      — force the dreadnought ambush even in sector 1
 *     waveBias      — 'swarmer' | 'sniper' | 'charger': themed waves dominate
 *     asteroidMult  — scales asteroid spawn rate
 *     goldRush      — streams of XP orbs + powerups instead of heavy waves
 *     scoreMult     — score multiplier for everything earned in the node
 *     finale        — the Overmind fight; winning completes the campaign
 */

import { store } from './store.js';

export const MAP_ZONES = [
    { id: 1, name: 'THE PORCH LIGHTS', color: '#44ff88', labelX: 10 },
    { id: 2, name: 'THE JUNK BELT',    color: '#ffaa44', labelX: 42 },
    { id: 3, name: 'VRAX SPACE',       color: '#ff4466', labelX: 74 }
];

export const MAP_NODES = [
    // ---------------- Zone 1 — THE PORCH LIGHTS ----------------
    {
        id: 'n1', name: 'DRIVEWAY PATROL', zone: 1, x: 8, y: 62, sector: 1, type: 'PATROL',
        unlockedBy: [], mods: { noMiniboss: true },
        lore: 'Home space. The Vrax are poking at our mail drones. Poke back. Harder.'
    },
    {
        id: 'n2', name: 'MAILBOX CLUSTER', zone: 1, x: 18, y: 34, sector: 1, type: 'SKIRMISH',
        unlockedBy: ['n1'], mods: { noBoss: true, noMiniboss: true, lengthMult: 0.7 },
        lore: 'A relay field of ninety thousand mailboxes. At least one contains a live Vrax. Postal code unknown.'
    },
    {
        id: 's1', name: 'COUPON NEBULA', zone: 1, x: 8, y: 12, sector: 1, type: 'SECRET',
        unlockedBy: ['n2'], secretOf: { node: 'n2', grade: 'A' }, reward: 'upgrade',
        mods: { noBoss: true, noMiniboss: true, goldRush: true, scoreMult: 3, lengthMult: 0.6 },
        lore: 'Legend says everything in this nebula is seventy percent off. The legend is accurate. Grab it all.'
    },
    {
        id: 'n3', name: 'TOLLBOOTH-77', zone: 1, x: 27, y: 60, sector: 2, type: 'ASSAULT',
        unlockedBy: ['n2'], mods: {},
        lore: 'The Vrax parked a dreadnought in lane three. EZ-Pass is not honored here. Your lasers are.'
    },

    // ---------------- Zone 2 — THE JUNK BELT ----------------
    {
        id: 'n4', name: 'SCRAPYARD SPIRAL', zone: 2, x: 38, y: 46, sector: 3, type: 'HAZARD',
        unlockedBy: ['n3'], mods: { asteroidMult: 3 },
        lore: 'Six centuries of space junk in a blender. Guild surveyors insist some of these asteroids are load-bearing.'
    },
    {
        id: 'n5', name: 'OLD WAR ROAD', zone: 2, x: 49, y: 22, sector: 3, type: 'ASSAULT',
        unlockedBy: ['n4'], mods: {},
        lore: 'Wrecks from the First Vrax War line this route like mile markers. Lately, the wrecks have been waking up.'
    },
    {
        id: 'n6', name: 'GLITTER MINES', zone: 2, x: 49, y: 72, sector: 3, type: 'SWARM',
        unlockedBy: ['n4'], mods: { waveBias: 'swarmer', noMiniboss: true },
        lore: 'The swarm nests here, polishing everything to a mirror shine. Guild advisory: bring sunglasses and a flak cannon.'
    },
    {
        id: 's2', name: "GRANDMA'S HOUSE", zone: 2, x: 39, y: 90, sector: 3, type: 'SECRET',
        unlockedBy: ['n6'], secretOf: { node: 'n6', grade: 'A' }, reward: 'upgrade',
        mods: { noBoss: true, noMiniboss: true, goldRush: true, scoreMult: 2, lengthMult: 0.6 },
        lore: 'An old colony dome that smells of cookies and ozone. Grandma refuses to evacuate and insists you take supplies.'
    },
    {
        id: 'n7', name: 'CHECKPOINT CHUCKLES', zone: 2, x: 60, y: 48, sector: 4, type: 'SIEGE',
        unlockedBy: ['n5', 'n6'], mods: { bossRush: true, lengthMult: 0.55 },
        lore: 'The checkpoint\'s automated comedian has told the same joke for forty years. Tonight, you end the set.'
    },

    // ---------------- Zone 3 — VRAX SPACE ----------------
    {
        id: 'n8', name: 'THE STATIC FIELDS', zone: 3, x: 71, y: 24, sector: 5, type: 'ASSAULT',
        unlockedBy: ['n7'], mods: { waveBias: 'sniper' },
        lore: 'A nebula of pure interference. Their snipers can see through it. You cannot. Fly accordingly.'
    },
    {
        id: 'n9', name: 'LULLABY LANE', zone: 3, x: 71, y: 72, sector: 5, type: 'AMBUSH',
        unlockedBy: ['n7'], mods: { waveBias: 'charger' },
        lore: 'So named because travelers here get "put to sleep." Guild humor did not survive the war intact.'
    },
    {
        id: 's3', name: 'THE TOASTER', zone: 3, x: 62, y: 92, sector: 6, type: 'SECRET',
        unlockedBy: ['n9'], secretOf: { node: 'n9', grade: 'A' }, reward: 'upgrade',
        mods: { scoreMult: 3, noMiniboss: true },
        lore: 'Deep scans found it: the toaster that started the war, still broadcasting COOK ALL ORGANICS from a Vrax shrine. Avenge breakfast.'
    },
    {
        id: 'n10', name: 'THE POLISHED GATES', zone: 3, x: 84, y: 46, sector: 6, type: 'ASSAULT',
        unlockedBy: ['n8', 'n9'], mods: {},
        lore: 'The final approach to Vrax Prime. Every hull here reflects your face back at you. It looks worried.'
    },
    {
        id: 'n11', name: 'VRAX PRIME', zone: 3, x: 93, y: 20, sector: 7, type: 'FINALE',
        unlockedBy: ['n10'], mods: { finale: true, noMiniboss: true, lengthMult: 0.5 },
        lore: 'The Overmind waits at the heart of the chrome. You have one package left to deliver: RETURN TO SENDER.'
    }
];

export const getNode = id => MAP_NODES.find(n => n.id === id);

const GRADE_RANK = { A: 4, B: 3, C: 2, D: 1 };

const DEFAULT_CAMPAIGN = () => ({ unlocked: ['n1'], completed: {}, victory: false });

export const Campaign = {
    state: DEFAULT_CAMPAIGN(),

    load() {
        this.state = { ...DEFAULT_CAMPAIGN(), ...store.get('campaign', {}) };
    },
    save() { store.set('campaign', this.state); },
    wipe() { this.state = DEFAULT_CAMPAIGN(); this.save(); },

    isUnlocked(id)  { return this.state.unlocked.includes(id); },
    isCompleted(id) { return id in this.state.completed; },
    grade(id)       { return this.state.completed[id] || null; },

    /**
     * Secret nodes are invisible until their gateway node is completed at all
     * (then shown as "???"), and only unlock at the required grade.
     */
    isVisible(node) {
        if (!node.secretOf) return true;
        return this.isCompleted(node.secretOf.node);
    },

    meetsSecretGrade(node) {
        if (!node.secretOf) return true;
        const g = this.grade(node.secretOf.node);
        return !!g && GRADE_RANK[g] >= GRADE_RANK[node.secretOf.grade];
    },

    /**
     * Record a completion (keeping the best grade) and re-derive unlocks.
     * Returns the ids of newly unlocked nodes so the UI can celebrate them.
     */
    completeNode(id, grade) {
        const prev = this.grade(id);
        if (!prev || GRADE_RANK[grade] > GRADE_RANK[prev]) this.state.completed[id] = grade;
        if (getNode(id)?.mods.finale) this.state.victory = true;

        const fresh = [];
        MAP_NODES.forEach(n => {
            if (this.isUnlocked(n.id)) return;
            const routeOpen = n.unlockedBy.some(p => this.isCompleted(p));
            if (routeOpen && this.meetsSecretGrade(n)) {
                this.state.unlocked.push(n.id);
                fresh.push(n.id);
            }
        });

        this.save();
        return fresh;
    },

    /** Every route (edge) as [fromNode, toNode] pairs, for drawing. */
    edges() {
        const list = [];
        MAP_NODES.forEach(n => n.unlockedBy.forEach(p => list.push([getNode(p), n])));
        return list;
    }
};
