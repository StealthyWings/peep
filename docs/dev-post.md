*This is a submission for the [Hacktoberfest Open-Source AI Challenge Week 1: Touch Grass](https://dev.to/challenges/hacktoberfest-week1-2026-10-05)*

## What I Built

You're on a walk and something in a tree is singing. You've heard it a hundred times and you have no idea what it is.

peep tells you. Tap **Listen** and it names the bird from its song, or tap **Snap** and it names it from a photo. Then it gives you one fun fact about it and sends you back outside. Both identifications run on open models inside the phone, so it works in the middle of a forest with no signal, costs nothing per bird, and never uploads your recordings, photos or location.

It's for anyone who walks past birds every day without knowing their names: families, students, people on their morning walk, and birders who want something that works off the grid.

Around the identification I built the parts that make people want to go out again:

- **Stickers for getting outside, not for tapping.** They count unique species (photographing the same pigeon 100 times earns nothing), plus things like birding on 7 different days, in 5 different places, or before 7 am.
- **A share card** you can post to Instagram or WhatsApp.
- **Flocks:** private groups for family and friends. You swipe through what they spotted since you last looked, the feed ends with "You're all caught up", and the group works towards a weekly goal like "find 15 species between you".
- **Hands-free mode.** The phone buzzes when it's done listening and says the result and the fact out loud, so your eyes stay on the bird.

The whole design goal was to make the screen the shortest part of the walk.

## Demo

[TODO: live demo link once deployed]

[TODO: embed the demo video]

The walkthrough:

1. Tap **Listen** and point the phone at a singing bird for 12 seconds.
2. peep names it ("That sounds like a Eurasian Blackbird. Very likely.") and shows whether it's expected where you are this week.
3. Log it. You get the species card, a fun fact, and any stickers you just earned.
4. **Snap** a photo of another bird. If it's tiny in the frame, tap it so the model zooms in.
5. Open your flock, swipe through a friend's finds, and reach the end of the feed.
6. Turn on airplane mode and do it all again.

[TODO: screenshots of the Spot screen, a result card, the sticker shelf, the flock feed and the share card]

## Code

[TODO: GitHub repo link or embed]

MIT licensed. Model weights keep their own licenses (BirdNET is CC BY-SA 4.0, AIY Birds is Apache 2.0) and the field guide text is from Wikipedia under CC BY-SA 4.0.

## How I Built It

peep is a React and TypeScript progressive web app with a tiny Node backend. There's no cloud AI anywhere in it.

### Song ID: BirdNET in a Web Worker

[BirdNET](https://github.com/birdnet-team/BirdNET-Analyzer), from the Cornell Lab of Ornithology and Chemnitz University of Technology, recognises 6,522 sound classes: mostly birds, plus frogs, crickets and a few mammals. The BirdNET team publishes a TensorFlow.js port, so I run it in a Web Worker with a WebGL kernel that turns raw audio into a spectrogram inside the model.

Recording turns off the phone's noise suppression and auto-gain, because those are tuned for voices and erase birdsong. The audio is resampled to 48 kHz and split into overlapping 3-second windows, and the scores are pooled so one clear call in a noisy recording still counts. A 21-second blackbird recording came back as Common Blackbird at 94%.

### Photo ID: AIY Birds with MediaPipe

Photos go through Google's open AIY Birds V1 classifier (964 species), running in the browser through MediaPipe. On my laptop it takes about 110 ms per photo. It got a Blue Jay (96%), Northern Cardinal (92%), House Sparrow (91%), Common Myna (99%) and Indian Peafowl (97%) right.

Phone photos of birds are usually a small bird in a big frame, which classifiers handle badly. So peep runs the model on several crops, the whole photo plus tighter ones, and keeps each species' best score. If that still fails, you tap the bird and it crops around your tap.

### "Is that bird even found here?"

BirdNET also ships a small geo model. Give it a latitude, longitude and week of the year, and it returns how likely each species is there. It runs on the device and re-ranks both photo and sound results. In testing it rated a blackbird in London at 0.96 and a Northern Cardinal (an American bird) at 0.0005. Unlikely birds are labelled "unusual here" and pushed down rather than hidden, so you can still log a genuine rarity.

### An offline field guide, with facts picked by Gemma

Every species both models know (6,629 of them) has an entry with a name, a short summary and one fun fact, built from Wikipedia and bundled with the app so it works offline.

Picking the fact is where I used **Gemma 3 4B**, running locally through Ollama. My first attempt asked Gemma to write a fun fact from the Wikipedia intro. Most were good, but it told me the Long-tailed Sylph is "known for its distinctive, high-pitched calls that resemble a tee-hee sound". The source says nothing like that.

So I changed the job. Gemma now gets the intro as numbered sentences, picks the one a person on a walk would find most surprising, and condenses it. Its answer is only used if it passes three checks:

1. Every meaningful word and every number in the fact must appear in the Wikipedia text. This is what caught the invented sylph call.
2. It has to be family friendly. Gemma correctly reported that the house sparrow is a cultural "symbol of lust, sexual potency, and commonness", which is true, and not something you want on a share card.
3. It can't be a dull range, taxonomy or plumage line, which Gemma sometimes picked despite being told not to.

If a check fails, the species keeps the best sentence from a simple keyword scorer. At the time of writing Gemma has processed 258 species and 63 of its facts passed. A few favourites:

> It is believed the male kori bustard may be the heaviest living animal capable of flight.

> It is believed to be the most abundant living land bird in North America, with flocks exceeding a million. *(Red-winged Blackbird)*

> It's famously known for its song, described by Captain James Cook as "like small bells most exquisitely tuned". *(New Zealand Bellbird)*

Facts from Gemma are credited in the app. It runs at 7 to 8 species a minute on my laptop's CPU, so the rest of the guide fills in as the run continues.

### Offline first

A service worker caches the app. A "Save for offline" button stores both models and the field guide on the phone (63 MB, once), and sightings live in IndexedDB on the device. To test it I shut the server down completely, reloaded, and identified an Indian Peafowl from a photo: 97%, with its name and fact.

Getting there taught me that offline is a lot of small details. My first service worker cached the page but not its JavaScript, and once cached an error page as the field guide. You only find these by pulling the plug.

### Flocks: a small backend you can run yourself

The flock server is a single Node file with zero dependencies, using the SQLite built into Node 22. It handles sign-up (a name and an avatar, no password or email), invite codes, the feed, the leaderboard and the weekly goal. It only receives species names, times and stickers, plus a photo when you choose to share that one. Your location never leaves the phone, so rare-bird spots can't leak.

### Design

I wanted it to feel like a field guide rather than a dashboard: a parchment, sage and olivewood palette, Cormorant Garamond for headings, Jost for labels, and hand-drawn line icons for the stickers, tabs and avatars instead of emojis. Everything is bundled so it works offline, and on a laptop it switches to a sidebar layout.

### Taking it outside

[TODO: the challenge gives bonus points for this. Add a few honest lines about your walk: where you went, what peep got right, what it got wrong.]

## Why Does Open Innovation Matter?

For a birding app, open models are what make it work at all.

**Birds live where the signal doesn't.** A cloud vision API is useless two kilometres into a forest. Because the models are open, I can ship them to the phone, and peep identifies birds in airplane mode.

**Location data is sensitive.** Where you walk every morning is personal, and so is where a rare bird is nesting. With on-device models, your location is only ever read by a model on your own phone.

**There's no bill per bird.** Nothing to ration, no login wall, no API key. A family can run their own flock server on an old laptop.

**I could change how the models behave.** I added multi-crop photo inference, tap-to-focus, pooling across audio windows, and a location prior that demotes unlikely birds instead of hiding them. None of that is possible behind a closed API.

**I could swap and inspect the models.** AIY Birds is strongest on North American and European species. I'm in India, and while it got the myna and peafowl right, a regional model would do better. With open models that's a file swap. And because Gemma ran on my own machine, I could see exactly where it invented things and build checks to stop it. That's how I learned the hard part isn't running a language model, it's making it trustworthy.

## My Agent Session

I built peep with Claude Code, from the first idea to this write-up.

The session started with checking my original idea (a photo-only bird app with an Instagram-style feed) against the challenge rules. The review pointed out that I hadn't said which open AI would power it, that photo-only ID frustrates people because birds fly away, and that an endless feed works against "touch grass". That's where song ID, the offline trail pack and the feed that ends came from.

From there it covered testing the open models before building on them, building and checking every screen in a real browser, shutting the server down to prove the offline claims, and the Gemma fact pipeline, including catching the invented sylph call. It also had the unglamorous parts: Wikipedia rate-limiting my build script until it identified itself properly, a shell that quietly turned `\b` in regexes into backspace characters, and a stray "3" that broke the whole app.

[TODO: link or embed the session]

## Prize Categories

**Best Use of Gemma.** Gemma 3 4B, running locally through Ollama, picks the fun fact for each species in the offline field guide. It chooses and condenses a sentence from Wikipedia, and its answer is only used if every word and number is grounded in the source, it's family friendly, and it isn't a dull taxonomy line. Facts it chose are credited in the app.

**Best Use of GitHub Copilot.** A GitHub Actions workflow typechecks, lints and builds the app and smoke-tests the flock API on every push. A Copilot instructions file teaches Copilot's PR reviews the project's rules (on-device AI only, offline first, privacy, no endless feeds) for Hacktoberfest contributors. [TODO: link a passing CI run once the repo is pushed]

**Best Use of Render.** [TODO: keep only once deployed] The app and flock server deploy to Render as one web service from the included `render.yaml`, which gives friends a link they can join from their phones over HTTPS.

**Best Use of ElevenLabs.** [TODO: keep only if you use it] The demo video's narration was generated with ElevenLabs.
