import { value, batch, effect } from "anod";
import { array } from "anod/array";

function Member(age, name) {
    this.age = age;
    this.name = name;
}

const members = array([
    new Member(21, "Leif"),
    new Member(35, "Siv"),
    new Member(48, "Sonja")
]);

const eventPlanned = value(false);

const childExists = members.some(member => member.age < 18);
const memberNames = members.map(member => member.name).join(", ");

effect(() => {
    console.log(`Member list${childExists.val() ? " (has children)" : ""}: ${memberNames.val()}.${eventPlanned.val() ? " Event planned, stay tuned!" : ""}`);
});
// Prints "Member list: Leif, Siv, Sonja."

members.push(new Member(15, "Lars"));
// Prints "Member list (has children): Leif, Siv, Sonja, Lars."

members.unshift(new Member(28, "Astrid"));
// Prints "Member list (has children): Astrid, Leif, Siv, Sonja, Lars."

batch(function() {
    members.pop();
    eventPlanned.set(true);
});
// Prints "Member list (has children): Astrid, Leif, Siv, Sonja. Event planned, stay tuned!"
