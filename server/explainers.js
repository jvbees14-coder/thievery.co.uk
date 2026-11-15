// ---------------------------------------------------------------------------
// How it works: the explainers, and the index of them at /how-it-works.
//
// An explainer is one page that teaches how something works by letting you
// play with it: a live scene pinned beside writing cut into chapters. Each
// is a view in server/views/how-it-works/, built on the layout in
// server/views/how-it-works/_layout.html, and listed here. Nothing that is
// not listed here is served, so a half-written explainer in the folder is
// not a live page by accident.
//
// The pages need nothing from the store and no login, so site.js answers
// them alongside About and the tools, and they stay up in an outage. The
// scene's code is static, in public/explainers/.
//
// docs/ADDING_AN_EXPLAINER.md is the walk-through.
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import { VIEWS, render, strip } from './views.js';

// The index is in sections, in this order; an explainer names its section
// by id in `group`.
export const GROUPS = [
  { id: 'chance', name: 'Cards and chance' },
  { id: 'secrets', name: 'Locks and secrets' },
  { id: 'earth', name: 'Space and the Earth' },
  { id: 'machines', name: 'Machines and waves' },
  { id: 'computers', name: 'Computers and networks' },
  { id: 'numbers', name: 'Numbers and people' },
];

// What the index shows, in the order it shows it within each section. The
// slug is the address and must never change once the page is live. `thumb`
// is the module that draws the moving picture on the index card (it
// exports `thumb(ctx, w, h, t, colours)`, and the share picture is drawn
// with it too); `minutes` is a fair reading time.
export const EXPLAINERS = [
  {
    slug: 'gps',
    group: 'earth',
    view: 'gps.html',
    name: 'How GPS finds you',
    hook: 'Thirty-two satellites, a stopwatch, and a correction from Einstein.',
    chapters: 6,
    minutes: 10,
    thumb: '/explainers/gps/thumb.js',
    alt: 'The Earth with GPS satellites moving along six orbits round it.',
  },
  {
    slug: 'tides',
    group: 'earth',
    name: 'Why the sea comes in twice a day',
    hook: 'Two bulges, one Moon, and the Sun pulling the other way.',
    lede: 'The Moon pulls the sea towards it. So why are there two high tides a day, not one?',
    description: 'An interactive explainer on tides: the Moon\'s tidal force, the two bulges, why high tide is 12 hours 25 minutes apart, spring and neap tides, and real coasts.',
    chapters: 5,
    minutes: 6,
    alt: 'The Earth seen from above the North Pole, inside two bulges of water, with the Moon going round.',
  },
  {
    slug: 'map-projections',
    group: 'earth',
    name: 'Why every map is wrong',
    hook: 'Drag Greenland to the equator and watch it shrink.',
    lede: 'A globe cannot be flattened without stretching it somewhere. Every world map is a decision about where.',
    description: 'An interactive explainer on map projections: why a sphere cannot be flattened, Mercator, Tissot\'s circles, equal-area maps, and dragging Greenland across the world.',
    chapters: 5,
    minutes: 6,
    alt: 'A world map gliding between the Mercator and Equal Earth projections.',
  },
  {
    slug: 'mechanical-watch',
    group: 'machines',
    name: 'How a mechanical watch keeps time',
    hook: 'A spring, a swinging wheel, and eight ticks a second.',
    lede: 'No battery, no electronics: just a coiled spring let out in exactly equal portions. Here is the part that does the letting.',
    description: 'An interactive explainer on mechanical watches: the mainspring, the balance wheel, the lever escapement, the gear train, and how accurate they are.',
    chapters: 5,
    minutes: 6,
    alt: 'A balance wheel swinging beside an escape wheel stepping round.',
  },
  {
    slug: 'car-engine',
    group: 'machines',
    name: 'How a car engine works',
    hook: 'Suck, squeeze, bang, blow, 25 times a second.',
    lede: 'Inside a petrol engine, small explosions push pistons up and down thousands of times a minute. Here is one cylinder, slowed right down.',
    description: 'An interactive explainer on four-stroke petrol engines: the four strokes, the crankshaft, compression ratio and efficiency, and firing order.',
    chapters: 4,
    minutes: 5,
    alt: 'A cylinder cut in half, its piston, valves and crankshaft moving through the four strokes.',
  },
  {
    slug: 'wing-lift',
    group: 'machines',
    name: 'How a wing makes lift',
    hook: 'Faster on top, turned downwards, and not for the reason you were told.',
    lede: 'A wing holds up a plane by changing how the air around it moves. Here is the air, worked out exactly.',
    description: 'An interactive explainer on how wings make lift: air flow round an aerofoil, the equal-transit myth, pressure, angle of attack and stalling, and the lift equation.',
    chapters: 5,
    minutes: 6,
    alt: 'Lines of air flowing round a tilted wing.',
  },
  {
    slug: 'camera-lens',
    group: 'machines',
    name: 'How a camera lens focuses',
    hook: 'Bent light, a hole that halves, and why backgrounds blur.',
    lede: 'A lens gathers light from every point of a scene and brings it back to a point. Here is how, with a real 50 mm lens.',
    description: 'An interactive explainer on camera lenses: refraction and the thin-lens equation, focusing, aperture and f-numbers, depth of field, and focal length.',
    chapters: 5,
    minutes: 6,
    alt: 'Three rays from an arrow passing through a lens and meeting at an upside-down image.',
  },
  {
    slug: 'sound',
    group: 'machines',
    name: 'How sound works',
    hook: 'Air that only shuffles, a wave that travels, and a square wave made of curves.',
    lede: 'Sound is a pattern of pushes travelling through the air. Here it is, slowed down, and you can play it too.',
    description: 'An interactive explainer on sound: pressure waves, frequency and pitch, harmonics and timbre, Fourier series, and the range of human hearing.',
    chapters: 5,
    minutes: 5,
    alt: 'A square wave building up out of smooth sine waves.',
  },
  {
    slug: 'compression',
    group: 'computers',
    name: 'How compression works',
    hook: 'Short codes for common letters, and a tree that finds the best ones.',
    lede: 'A ZIP file holds the same words in fewer bits. Type something and watch it shrink.',
    description: 'An interactive explainer on data compression: bits and bytes, letter frequency, Huffman coding built step by step, and the entropy limit.',
    chapters: 5,
    minutes: 5,
    alt: 'Bars of letter counts merging into a tree.',
  },
  {
    slug: 'touchscreen',
    group: 'computers',
    name: 'How a touchscreen knows where you touched',
    hook: 'An invisible grid, a stolen bit of charge, and a clever average.',
    lede: 'Your phone finds your finger to a fraction of a millimetre with wires several millimetres apart. Here is how.',
    description: 'An interactive explainer on capacitive touchscreens: the electrode grid, how a finger changes it, finding a touch between the wires, and multi-touch.',
    chapters: 4,
    minutes: 4,
    alt: 'A grid of wires with a glow moving across it where a finger touches.',
  },
  {
    slug: 'internet-packets',
    group: 'computers',
    name: 'How a message crosses the internet',
    hook: 'Cut into packets, sent by different roads, and put back in order.',
    lede: 'A message to New York arrives in pieces, by several routes, some of them twice. Here is how it still turns up whole.',
    description: 'An interactive explainer on internet packets: splitting messages, routing, out-of-order arrival, packet loss and TCP retransmission, and the speed of light in fibre.',
    chapters: 4,
    minutes: 5,
    alt: 'Points of light travelling along different routes through a network.',
  },
  {
    slug: 'qr-codes',
    group: 'computers',
    name: 'How a QR code works',
    hook: 'Corners to find it, a zigzag of bits, and spare bytes for scratches.',
    lede: 'A QR code is your text, laid out so a camera can find it at any angle and read it even when part of it is missing. Make one and take it apart.',
    description: 'An interactive explainer on QR codes: finder and timing patterns, how data is laid out, Reed-Solomon error correction levels, masks, and why logos in the middle work.',
    chapters: 5,
    minutes: 5,
    alt: 'A QR code with its finder patterns, timing lines and data shown in different colours.',
  },
  {
    slug: 'voting-systems',
    group: 'numbers',
    name: 'How voting systems differ',
    hook: 'Same voters, same candidates, different winners.',
    lede: 'Who wins an election depends on how the votes are counted as well as how people vote. Move the candidates and count it four ways.',
    description: 'An interactive explainer on voting systems: first past the post, the spoiler effect, ranked-choice voting, Condorcet winners, and Arrow\'s impossibility theorem.',
    chapters: 5,
    minutes: 5,
    alt: 'Dots for voters coloured by their favourite of three candidates.',
  },
  {
    slug: 'compound-interest',
    group: 'numbers',
    name: 'How compound interest works',
    hook: 'Interest on interest, a number called e, and the rule of 72.',
    lede: 'Money that earns interest on its interest grows in a curve, not a line. Here is the arithmetic, with the sliders.',
    description: 'An interactive explainer on compound interest: simple against compound interest, compounding frequency and e, the rule of 72, regular saving, debt and inflation.',
    chapters: 5,
    minutes: 5,
    alt: 'A curve bending upwards away from a straight line.',
  },
  {
    slug: 'shuffling',
    group: 'chance',
    name: 'How a shuffle mixes a deck',
    hook: 'Why seven riffles, and why the overhand shuffle barely works.',
    lede: 'A deck can be put in more orders than there are atoms in the Earth. Getting it into a random one takes more care than you might think.',
    description: 'An interactive explainer on shuffling cards: riffles, rising sequences, why seven riffles mix a deck, and why overhand shuffles do not.',
    chapters: 5,
    minutes: 7,
    alt: 'A row of cards coloured from one end to the other, mixing as it is riffled.',
  },
  {
    slug: 'card-counting',
    group: 'chance',
    name: 'How card counting works',
    hook: 'Plus one, minus one, and a very small edge.',
    lede: 'Blackjack is the one casino game with a memory. Here is the arithmetic counters use, and why it is less of a money machine than films suggest.',
    description: 'An interactive explainer on blackjack card counting: the house edge, the Hi-Lo count, the true count, and why the edge it gives is so small.',
    chapters: 5,
    minutes: 6,
    alt: 'Five playing cards fanned out, each tagged plus one, nought or minus one.',
  },
  {
    slug: 'pin-tumbler',
    group: 'secrets',
    name: 'How a pin tumbler lock works',
    hook: 'Five pins, one line, and the flaw that lets a lock be picked.',
    lede: 'The lock on your front door is a row of tiny pins and a line they must not cross. Here is how a key moves them, and how a pick can too.',
    description: 'An interactive explainer on pin tumbler locks: key pins, driver pins, the shear line, why one pin binds, and how picking and security pins work.',
    chapters: 5,
    minutes: 6,
    alt: 'A lock cut in half, with a key lifting five pins to a dotted line.',
  },
  {
    slug: 'passwords',
    group: 'secrets',
    name: 'How passwords are cracked',
    hook: 'Hashes, graphics cards, salt, and why length wins.',
    lede: 'A stolen password list is a list of scrambled fingerprints. Here is how attackers unscramble them, and what makes that slow.',
    description: 'An interactive explainer on password cracking: hashing, guessing speeds on a graphics card, slow hashes like bcrypt, salting, and why long passwords win.',
    chapters: 5,
    minutes: 6,
    alt: 'A grid of 256 squares, some lit, flipping as a password changes.',
  },
  {
    slug: 'public-key',
    group: 'secrets',
    name: 'How strangers share a secret',
    hook: 'Paint you can mix but not un-mix, and the arithmetic behind it.',
    lede: 'Every secure website begins with two computers agreeing a secret while everyone listens. Here is how that is possible.',
    description: 'An interactive explainer on public-key cryptography: the Diffie-Hellman key exchange with paint and with real numbers, and RSA.',
    chapters: 5,
    minutes: 6,
    alt: 'Two pots of paint mixed with a shared colour, crossing to make the same colour on both sides.',
  },
  {
    slug: 'monty-hall',
    group: 'chance',
    name: 'The Monty Hall problem',
    hook: 'Three doors, one car, and why you should always switch.',
    lede: 'A game-show puzzle that fooled thousands of mathematicians. Play it until the answer stops feeling wrong.',
    description: 'An interactive explainer on the Monty Hall problem: play the game, play it a thousand times, try a hundred doors, and see why the host’s knowledge matters.',
    chapters: 4,
    minutes: 5,
    alt: 'Three doors, one opened on nothing and another glowing as the better choice.',
  },
  {
    slug: 'birthday-paradox',
    group: 'chance',
    name: 'The birthday paradox',
    hook: 'Twenty-three people, and better than even odds of a shared birthday.',
    lede: 'Matches turn up far sooner than intuition says. Fill rooms with people and see why.',
    description: 'An interactive explainer on the birthday problem: pairs, the curve of chances, filling rooms one person at a time, and birthday attacks.',
    chapters: 4,
    minutes: 5,
    alt: 'A ring of 365 days with dots for birthdays, two of them joined in red.',
  },
  {
    slug: 'house-edge',
    group: 'chance',
    name: 'Why the house always wins',
    hook: 'One green pocket, and what it does over a thousand spins.',
    lede: 'Roulette looks like a coin toss with extra colours. One small pocket makes sure the casino wins in the long run.',
    description: 'An interactive explainer on the house edge in roulette: the zero, the long run, why betting systems fail, and the American double zero.',
    chapters: 5,
    minutes: 6,
    alt: 'A roulette wheel turning, with red, black and one green pocket.',
  },
  {
    slug: 'enigma',
    group: 'secrets',
    name: 'How the Enigma machine worked',
    hook: 'Rotors, a reflector, and the flaw that let it be broken.',
    lede: 'A typewriter that lit up a different letter every time. Type on a working one and follow the current through it.',
    description: 'An interactive explainer on the Enigma machine: its circuit, the turning rotors, why no letter was ever itself, the number of settings, and how cribs broke it.',
    chapters: 5,
    minutes: 7,
    alt: 'Three rotor windows showing letters above a lit lamp.',
  },
  {
    slug: 'frequency-analysis',
    group: 'secrets',
    name: 'How to break a secret code',
    hook: 'Count the letters, and the code gives itself away.',
    lede: 'A jumbled alphabet has more keys than there are stars, and falls to a pencil and some counting.',
    description: 'An interactive explainer on frequency analysis: substitution ciphers, counting letters, a first guess, reading the words, and the defence of many alphabets.',
    chapters: 5,
    minutes: 6,
    alt: 'Bars of letter counts with the tallest marked E.',
  },
  {
    slug: 'seasons',
    group: 'earth',
    name: 'Why there are seasons',
    hook: 'A leaning planet, not a changing distance.',
    lede: 'The Earth is closest to the Sun in January. Here is what really makes summer and winter.',
    description: 'An interactive explainer on the seasons: the Earth’s tilt, the height of the Sun, the length of the day, and why distance from the Sun is not the reason.',
    chapters: 4,
    minutes: 5,
    alt: 'The Earth on its orbit round the Sun, its axis leaning the same way.',
  },
  {
    slug: 'moon-phases',
    group: 'earth',
    name: 'The phases of the Moon',
    hook: 'Always half lit, and why eclipses are rare.',
    lede: 'The Moon is always half in sunlight. What changes is how much of that half we can see.',
    description: 'An interactive explainer on the phases of the Moon: the lit half, the names of the phases, why a month is 29½ days, and why there is not an eclipse every month.',
    chapters: 4,
    minutes: 5,
    alt: 'A row of five moons from crescent to full.',
  },
  {
    slug: 'rainbows',
    group: 'earth',
    name: 'How a rainbow works',
    hook: 'Forty-two degrees, and a circle round your shadow.',
    lede: 'Every rainbow is light bounced back out of millions of raindrops at almost exactly the same angle.',
    description: 'An interactive explainer on rainbows: rays through a raindrop, the 42° angle, how the colours split, why the bow is a circle, and the second bow.',
    chapters: 5,
    minutes: 6,
    alt: 'White light entering a raindrop and fanning out as colours.',
  },
  {
    slug: 'electric-motor',
    group: 'machines',
    name: 'How an electric motor works',
    hook: 'A push on a wire, and a ring that flips the current.',
    lede: 'Every fan, drill and electric car turns on the same push between a current and a magnet. Here is how it becomes a spin.',
    description: 'An interactive explainer on electric motors: the force on a wire, a coil in a magnetic field, the commutator, and why a motor settles at a speed.',
    chapters: 4,
    minutes: 5,
    alt: 'A coil turning between a north and a south magnetic pole.',
  },
  {
    slug: 'heat-pump',
    group: 'machines',
    name: 'How a heat pump works',
    hook: 'Heat out of cold air, and more out than you put in.',
    lede: 'A heat pump warms a house with heat taken from the air outside, even on a frosty day.',
    description: 'An interactive explainer on heat pumps: the refrigerant loop, a liquid that boils below freezing, the coefficient of performance, and cold weather.',
    chapters: 4,
    minutes: 5,
    alt: 'Refrigerant going round a loop, blue on the outdoor side and red indoors.',
  },
  {
    slug: 'logic-gates',
    group: 'computers',
    name: 'How computers add up',
    hook: 'Switches, gates, and a carry passed down the line.',
    lede: 'A computer is billions of switches. Here is how a few of them can add two numbers, and remember one.',
    description: 'An interactive explainer on logic gates: the transistor as a switch, AND, OR and NOT, adding binary numbers with full adders, and a latch that remembers a bit.',
    chapters: 4,
    minutes: 5,
    alt: 'An AND gate with two inputs and an output lamp.',
  },
  {
    slug: 'pagerank',
    group: 'computers',
    name: 'How a search engine ranks pages',
    hook: 'Links as votes, and a surfer who clicks at random.',
    lede: 'The idea that started Google: a page matters if pages that matter link to it.',
    description: 'An interactive explainer on PageRank: links as votes, the random surfer, working the ranks out round by round, and the damping factor.',
    chapters: 4,
    minutes: 5,
    alt: 'Eight pages joined by links, sized by their rank.',
  },
  {
    slug: 'sorting',
    group: 'computers',
    name: 'How computers sort',
    hook: 'Bubble, merge and quick, and why the method matters.',
    lede: 'Putting things in order one comparison at a time, and how the right method saves billions of them.',
    description: 'An interactive explainer on sorting algorithms: bubble sort, merge sort and quicksort played step by step, and a race between them.',
    chapters: 4,
    minutes: 5,
    alt: 'A row of bars being sorted from shortest to tallest.',
  },
  {
    slug: 'traffic-jams',
    group: 'numbers',
    name: 'Why traffic jams appear from nowhere',
    hook: 'A wave of braking that travels backwards.',
    lede: 'Some jams have no accident and no roadworks behind them. A ring of simulated drivers shows where they come from.',
    description: 'An interactive explainer on phantom traffic jams: a ring road experiment, the backward-moving wave, how crowding sets them off, and one steady driver who smooths them out.',
    chapters: 4,
    minutes: 5,
    alt: 'Cars on a ring road with a red knot of slow traffic.',
  },
  {
    slug: 'epidemics',
    group: 'numbers',
    name: 'How epidemics spread',
    hook: 'R, the curve, and why herd immunity works.',
    lede: 'One number decides whether an outbreak fizzles or explodes. Here is the arithmetic behind it.',
    description: 'An interactive explainer on epidemics: chains of infection and R, the SIR model, herd immunity, and how fewer contacts lower and delay the peak.',
    chapters: 4,
    minutes: 5,
    alt: 'Three curves: people who can catch it falling, the ill rising and falling, and the recovered rising.',
  },
];
// The view and the thumbnail are found by the slug unless an entry says
// otherwise.
for (const x of EXPLAINERS) {
  x.view ||= `${x.slug}.html`;
  x.thumb ||= `/explainers/${x.slug}/thumb.js`;
}

const DIR = path.join(VIEWS, 'how-it-works');

function card(x) {
  return `<li>
        <a class="hiw-card" href="/how-it-works/${x.slug}">
          <canvas class="hiw-thumb" data-thumb="${x.thumb}" role="img" aria-label="${x.alt}"></canvas>
          <span class="hiw-card-name">${x.name}</span>
          <span class="hiw-card-hook">${x.hook}</span>
          <span class="hiw-card-meta">${x.chapters} chapters · about ${x.minutes} minutes</span>
        </a>
      </li>`;
}

let index = null;
/** The index page, built from the list above. */
export function indexPage() {
  if (!index) {
    const html = fs.readFileSync(path.join(VIEWS, 'how-it-works.html'), 'utf8');
    const sections = GROUPS.map((g) => {
      const here = EXPLAINERS.filter((x) => x.group === g.id);
      if (!here.length) return '';
      return `<section class="hiw-group" aria-labelledby="g-${g.id}">
      <h2 class="hiw-group-name" id="g-${g.id}">${g.name}</h2>
      <ul class="hiw-grid">
      ${here.map(card).join('\n      ')}
      </ul>
    </section>`;
    }).join('\n    ');
    index = render(html.split('{{explainers}}').join(sections));
  }
  return index;
}

// An explainer's view is either a whole page (gps.html) or only its writing,
// which is poured into _page.html: everything above the line
// that says "end of chapters" is the chapters, everything below it the sources
// and the glossary. Either way the shared stage goes in at {{hiw-stage}}.
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
function build(x) {
  const read = (name) => fs.readFileSync(path.join(DIR, name), 'utf8');
  // The shared pieces' own notes name the placeholders, so they come out
  // before anything is filled in, or a note would be filled in too.
  const shared = (name) => strip(read(name));
  let html = read(x.view);
  if (!html.trimStart().toLowerCase().startsWith('<!doctype')) {
    const [chapters, after = ''] = html.split('<!-- end of chapters -->');
    const jsonld = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'LearningResource',
      name: x.name,
      description: x.description || x.hook,
      url: `https://thievery.co.uk/how-it-works/${x.slug}`,
      learningResourceType: 'Interactive explainer',
      inLanguage: 'en-GB',
      isAccessibleForFree: true,
    });
    const fill = {
      'hiw-title': esc(x.name),
      'hiw-hook': esc(x.hook),
      'hiw-lede': x.lede || esc(x.hook),
      'hiw-slug': x.slug,
      'hiw-alt': esc(x.alt),
      'hiw-description': esc(x.description || x.hook),
      'hiw-jsonld': jsonld,
      'hiw-chapters': chapters,
      'hiw-after': after,
    };
    html = shared('_page.html').replace(/[{][{](hiw-[a-z]+)[}][}]/g, (whole, key) => (key in fill ? fill[key] : whole));
  }
  return html.split('{{hiw-stage}}').join(shared('_stage.html'));
}

const pages = new Map();
/** One explainer's page, or null if there is no such live explainer. */
export function page(slug) {
  const x = EXPLAINERS.find((e) => e.slug === slug);
  if (!x) return null;
  if (!pages.has(slug)) pages.set(slug, render(build(x)));
  return pages.get(slug);
}

/**
 * The page for an address, or null. /how-it-works/ with the slash is not
 * answered here: site.js sends it to the address without one.
 */
export function pageFor(pathname) {
  if (pathname === '/how-it-works') return indexPage();
  const m = /^\/how-it-works\/([a-z0-9-]+)$/.exec(pathname);
  return m ? page(m[1]) : null;
}
