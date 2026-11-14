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
