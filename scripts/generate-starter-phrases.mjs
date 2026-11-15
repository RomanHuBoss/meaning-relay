// Генерирует пул стартовых мыслей, которые оставляют место для продолжения.
/* global process, console */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const requestedCount = Number(process.argv[2] ?? 3000);
const count = Number.isInteger(requestedCount) && requestedCount > 0 ? requestedCount : 3000;
const output = resolve(process.argv[3] ?? "data/starter-phrases.json");

const openings = [
  ["Иногда тишина появляется прямо перед самым важным словом", "Sometimes silence arrives just before the most important word"],
  ["Память сохраняет не событие, а его поздний оттенок", "Memory keeps not the event but its later shade"],
  ["Один честный вопрос меняет направление разговора", "One honest question changes the direction of a conversation"],
  ["Время возвращает нас к местам, которые мы считали пройденными", "Time returns us to places we thought we had left behind"],
  ["Маленькая доброта остаётся дольше того, кто её сделал", "A small kindness lasts longer than the person who offered it"],
  ["Расстояние становится короче, когда у него появляется имя", "Distance grows shorter once it has a name"],
  ["Дом начинается там, где тебя узнают по шагам", "Home begins where someone recognizes your footsteps"],
  ["Случайная встреча продолжает разговор, начатый много лет назад", "A chance meeting continues a conversation begun years ago"],
  ["Свет в окне напоминает, что чьё-то ожидание ещё не закончилось", "A light in the window says that someone's waiting is not over"],
  ["Человек слышит собственный голос после долгого молчания", "A person hears their own voice after a long silence"],
  ["Самое важное решение редко звучит как решение", "The most important decision rarely sounds like a decision"],
  ["Обычный день может хранить перемену до самого вечера", "An ordinary day can hide a change until evening"],
  ["Память тела просыпается раньше памяти слов", "The body's memory wakes before the memory of words"],
  ["Будущее иногда приходит в виде маленькой просьбы", "The future sometimes arrives as a small request"],
  ["Граница между случайностью и выбором становится тоньше с каждым шагом", "The border between chance and choice gets thinner with every step"],
  ["Возвращение начинается задолго до того, как мы поворачиваем назад", "Returning begins long before we turn back"],
  ["Вещи рассказывают о человеке больше, когда он перестаёт их объяснять", "Things reveal more about us when we stop explaining them"],
  ["Одиночество меняет размер комнаты", "Loneliness changes the size of a room"],
  ["Незнакомый голос может оказаться знакомым чувством", "An unfamiliar voice can carry a familiar feeling"],
  ["Пауза в разговоре иногда точнее любого ответа", "A pause in a conversation can be more precise than an answer"],
  ["Чужая история находит в нас место, которого мы не замечали", "Someone else's story finds a room in us we did not notice"],
  ["Вопрос, заданный слишком поздно, всё равно может открыть дверь", "A question asked too late can still open a door"],
  ["След от выбора остаётся даже тогда, когда сам выбор забыт", "The trace of a choice remains after the choice is forgotten"],
  ["Ночью город хранит обещания, которые днём кажутся невозможными", "At night a city keeps promises that seem impossible by day"],
  ["Встреча меняет смысл, если один человек пришёл раньше", "A meeting changes meaning when one person arrived early"],
  ["Сомнение бывает формой заботы о будущем", "Doubt can be a form of care for the future"],
  ["Память выбирает детали, которые разум назвал бы неважными", "Memory chooses details the mind would call unimportant"],
  ["Человек узнаёт себя по тому, что он не стал говорить", "A person recognizes themselves by what they did not say"],
  ["Дорога становится другой, когда на ней появляется попутчик", "A road becomes different when a companion appears on it"],
  ["Тепло иногда приходит из места, откуда его не ждали", "Warmth sometimes comes from where nobody expected it"],
  ["Слово может остаться внутри дольше человека, который его сказал", "A word can stay longer than the person who said it"],
  ["Утро начинается с решения, которое никто не видит", "Morning begins with a decision nobody sees"],
  ["Вещь, найденная случайно, может вернуть целый сезон жизни", "Something found by accident can return an entire season of life"],
  ["Страх уменьшается, когда его удаётся описать", "Fear grows smaller once it can be described"],
  ["Взгляд через окно иногда заменяет поездку", "A view through a window can replace a journey"],
  ["Тишина между двумя людьми не всегда означает расстояние", "Silence between two people does not always mean distance"],
  ["Старый маршрут помнит больше, чем его карта", "An old route remembers more than its map"],
  ["Надежда редко приходит первой, но почти всегда остаётся последней", "Hope rarely arrives first but almost always stays last"],
  ["Чужая доброта заставляет пересмотреть собственную строгость", "Someone else's kindness can soften our own strictness"],
  ["Иногда ожидание меняет сам предмет ожидания", "Sometimes waiting changes what we are waiting for"],
  ["Один шаг в сторону показывает всю привычную дорогу", "One step aside can reveal the whole familiar road"],
  ["Секрет становится легче, когда у него появляется слушатель", "A secret gets lighter once it has a listener"],
  ["Прошлое возвращается не событиями, а интонацией", "The past returns through intonation rather than events"],
  ["Самая тихая перемена первой меняет привычки", "The quietest change is usually the first to alter a habit"],
  ["Человек может скучать по версии себя, которой больше нет", "A person can miss a version of themselves that no longer exists"],
  ["Незаконченная фраза продолжает жить в памяти собеседника", "An unfinished sentence keeps living in the other person's memory"],
  ["Свет гаснет не всегда потому, что закончился день", "A light does not always go out because the day has ended"],
  ["Иногда мы называем случайностью то, к чему долго шли", "Sometimes we call chance what we had been walking toward"],
  ["Важная встреча может начаться с неверно произнесённого имени", "An important meeting can begin with a mispronounced name"],
  ["Время замедляется там, где приходится выбирать", "Time slows down where a choice must be made"],
  ["Путь домой меняется после первого честного признания", "The way home changes after the first honest admission"],
  ["Одна незаметная привычка может удерживать целую историю", "One unnoticed habit can hold an entire story together"],
  ["Смысл звучит иначе, когда меняется твоё место в комнате", "Meaning sounds different when your place in the room changes"],
  ["Некоторые ответы приходят после того, как вопрос перестаёт быть срочным", "Some answers arrive after the question stops being urgent"],
  ["Память оставляет свет вокруг того, что не смогла сохранить", "Memory leaves a glow around what it could not keep"],
  ["Доверие начинается с маленькой вещи, которую можно было скрыть", "Trust begins with a small thing that could have been hidden"],
  ["Расставание иногда впервые показывает форму близости", "A separation can reveal the shape of closeness for the first time"],
  ["В каждом городе есть улица, которая знает о нас больше друзей", "Every city has a street that knows more about us than our friends"],
  ["Слова становятся точнее, когда рядом появляется тишина", "Words become more precise when silence enters the room"],
  ["Самый короткий путь может потребовать самого долгого ожидания", "The shortest road may require the longest wait"],
  ["Мы замечаем перемену, когда старое объяснение перестаёт работать", "We notice change when an old explanation stops working"],
  ["Чужая ошибка иногда возвращает нам право начать заново", "Someone else's mistake can return our right to begin again"],
  ["У каждого обещания есть момент, когда оно становится действием", "Every promise has a moment when it becomes an action"],
];

const middles = [
  ["и оставляет человеку больше вопросов, чем ответов", "and leaves a person with more questions than answers"],
  ["хотя сначала кажется случайной", "although it first looks accidental"],
  ["потому что главное происходит немного в стороне от событий", "because the important part happens slightly away from the event"],
  ["и заставляет услышать то, что раньше терялось в шуме", "and makes us hear what used to disappear in the noise"],
  ["даже если никто не может назвать точную причину", "even when nobody can name the exact reason"],
  ["когда привычные объяснения уже не помогают", "when familiar explanations stop being enough"],
  ["и меняет значение вещей, которые казались неизменными", "and changes the meaning of things that seemed permanent"],
  ["пока мы заняты совсем другим", "while we are busy with something else entirely"],
  ["потому что у каждого решения есть невидимый собеседник", "because every decision has an invisible listener"],
  ["и оставляет место для чужой версии", "and leaves room for someone else's version"],
  ["когда один человек решается не торопить другого", "when one person decides not to hurry the other"],
  ["хотя внешне ничего не происходит", "although nothing appears to be happening"],
  ["и проверяет, что именно мы считаем своим", "and tests what we believe belongs to us"],
  ["если посмотреть на него с противоположной стороны", "if we look at it from the opposite side"],
  ["потому что прошлое редко возвращается в прежней форме", "because the past rarely returns in its old shape"],
  ["и требует не смелости, а внимания", "and asks for attention rather than courage"],
  ["когда детали начинают складываться в новый рисунок", "when details begin to form a new pattern"],
  ["даже если сначала это похоже на потерю", "even if it first feels like a loss"],
  ["и даёт разговору второе начало", "and gives the conversation a second beginning"],
  ["потому что человек меняется раньше, чем замечает это", "because a person changes before they notice it"],
  ["когда у молчания появляется причина", "when silence finally has a reason"],
  ["и делает привычное немного странным", "and makes the familiar slightly strange"],
  ["хотя именно так часто начинается важное", "although this is often how something important begins"],
  ["и оставляет выбор открытым дольше, чем хотелось бы", "and keeps the choice open longer than anyone wanted"],
];

const turns = [
  ["В этот момент прошлое звучит иначе", "At that moment the past sounds different"],
  ["Именно здесь начинается настоящий выбор", "This is where the real choice begins"],
  ["Остаётся понять, кто первым это заметит", "The question is who will notice first"],
  ["Но продолжение зависит от одного незаметного жеста", "The continuation depends on one unnoticed gesture"],
  ["Возможно, ответ уже находится внутри этой паузы", "Perhaps the answer is already inside this pause"],
  ["Дальше всё решит то, что обычно пропускают", "The next part will be decided by what people usually miss"],
  ["И тогда вопрос меняется сам", "And then the question changes by itself"],
  ["Никто ещё не знает, что это уже начало", "Nobody knows yet that this is already the beginning"],
  ["С этого места история может повернуть в любую сторону", "From here the story can turn in any direction"],
  ["Самое интересное начинается после очевидного вывода", "The interesting part starts after the obvious conclusion"],
  ["Только один человек знает, что было до этого", "Only one person knows what came before"],
  ["Теперь нужно решить, чему можно верить", "Now someone has to decide what can be trusted"],
  ["Следующий шаг покажет, что именно осталось важным", "The next step will show what still matters"],
  ["Всё зависит от того, будет ли сказано следующее слово", "Everything depends on whether the next word is spoken"],
  ["Именно поэтому эту историю трудно закончить", "That is why this story is difficult to finish"],
  ["Возможно, кто-то уже ждёт такого продолжения", "Perhaps someone is already waiting for this continuation"],
];

const topics = [
  ["тишина", "silence"], ["память", "memory"], ["выбор", "choice"], ["время", "time"],
  ["доброта", "kindness"], ["расстояние", "distance"], ["дом", "home"], ["вопрос", "question"],
  ["случайность", "chance"], ["свет", "light"], ["голос", "voice"], ["ожидание", "waiting"],
  ["доверие", "trust"], ["граница", "boundary"], ["возвращение", "return"], ["встреча", "meeting"],
];

function createPhrase(parts, index) {
  const combinationCount = parts.openings.length * parts.middles.length * parts.turns.length;
  const mixedIndex = (index * 7919) % combinationCount;
  const opening = parts.openings[mixedIndex % parts.openings.length];
  const middleIndex = Math.floor(mixedIndex / parts.openings.length) % parts.middles.length;
  const turnIndex = Math.floor(mixedIndex / (parts.openings.length * parts.middles.length)) % parts.turns.length;
  const middle = parts.middles[middleIndex];
  const turn = parts.turns[turnIndex];
  return [`${opening[0]} ${middle[0]}. ${turn[0]}.`, `${opening[1]} ${middle[1]}. ${turn[1]}.`];
}

const phrases = [];
const used = new Set();
let index = 0;
while (phrases.length < count) {
  const [seedRu, seedEn] = createPhrase({ openings, middles, turns }, index);
  index += 1;
  if (used.has(seedRu)) continue;
  used.add(seedRu);
  const number = String(phrases.length + 1).padStart(4, "0");
  const topic = topics[phrases.length % topics.length];
  phrases.push({
    slug: `starter-${number}`,
    title_ru: `${topic[0][0].toUpperCase()}${topic[0].slice(1)} · ${number}`,
    title_en: `${topic[1][0].toUpperCase()}${topic[1].slice(1)} · ${number}`,
    seed_text_ru: seedRu,
    seed_text_en: seedEn,
    status: "ACTIVE",
  });
}

await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(phrases, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ generated: phrases.length, output }));
