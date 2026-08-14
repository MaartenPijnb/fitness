"""
Zet een FitNotes backup (SQLite) om naar het JSON-seedformaat van de PWA.

Gebruik:  python tools/convert_fitnotes.py FitNotes_Backup.fitnotes data/seed.json

De IDs zijn deterministisch afgeleid van de FitNotes rij-IDs, zodat je deze
conversie opnieuw kunt draaien zonder duplicaten te maken bij een merge.
"""
import json
import sqlite3
import sys
from pathlib import Path

# FitNotes categorie -> Nederlandse weergavenaam + accentkleur van het thema
CATEGORIES = {
    "Shoulders": ("Schouders", "#f0a35e"),
    "Triceps":   ("Triceps",   "#4fd1c5"),
    "Biceps":    ("Biceps",    "#f2789f"),
    "Chest":     ("Borst",     "#6ea8fe"),
    "Back":      ("Rug",       "#a78bfa"),
    "Legs":      ("Benen",     "#7ee787"),
    "Abs":       ("Buik",      "#ffd76e"),
    "Cardio":    ("Cardio",    "#ff8a65"),
}

# FitNotes Comment.owner_type_id 1 = training_log set
COMMENT_OWNER_SET = 1


def convert(src: Path, dst: Path) -> None:
    con = sqlite3.connect(src)
    con.row_factory = sqlite3.Row
    cur = con.cursor()

    cats = []
    cat_by_id = {}
    for row in cur.execute("SELECT _id, name FROM Category ORDER BY _id"):
        nl, colour = CATEGORIES.get(row["name"], (row["name"], "#9aa4b2"))
        cid = f"c{row['_id']}"
        cat_by_id[row["_id"]] = cid
        cats.append({"id": cid, "name": nl, "src": row["name"], "colour": colour})

    # Alleen oefeningen die daadwerkelijk in het logboek voorkomen of favoriet zijn.
    used = {r[0] for r in cur.execute("SELECT DISTINCT exercise_id FROM training_log")}
    exercises = []
    for row in cur.execute("SELECT _id, name, category_id, exercise_type_id, is_favourite, notes FROM exercise ORDER BY name"):
        if row["_id"] not in used and not row["is_favourite"]:
            continue
        ex = {
            "id": f"e{row['_id']}",
            "name": row["name"],
            "cat": cat_by_id.get(row["category_id"], "c1"),
        }
        if row["exercise_type_id"] != 0:
            ex["type"] = row["exercise_type_id"]  # 3 = tijd/duur (planks)
        if row["is_favourite"]:
            ex["fav"] = 1
        if row["notes"]:
            ex["note"] = row["notes"]
        exercises.append(ex)

    # Notities hangen in FitNotes aan een set, niet aan een training.
    notes = {}
    for row in cur.execute("SELECT owner_id, comment FROM Comment WHERE owner_type_id = ?", (COMMENT_OWNER_SET,)):
        notes[row["owner_id"]] = row["comment"]

    sets = []
    for row in cur.execute(
        "SELECT _id, exercise_id, date, metric_weight, reps, is_personal_record, duration_seconds "
        "FROM training_log ORDER BY date, _id"
    ):
        s = {
            "id": f"s{row['_id']}",
            "ex": f"e{row['exercise_id']}",
            "d": row["date"],
            "w": round(row["metric_weight"], 2),
            "r": row["reps"],
        }
        if row["is_personal_record"]:
            s["pr"] = 1
        if row["duration_seconds"]:
            s["sec"] = row["duration_seconds"]
        if row["_id"] in notes:
            s["n"] = notes[row["_id"]]
        sets.append(s)

    plates = [r[0] for r in cur.execute(
        "SELECT weight FROM Plate WHERE enabled = 1 AND unit = 0 ORDER BY weight DESC")]
    bar = cur.execute("SELECT weight FROM Barbell WHERE unit = 0 LIMIT 1").fetchone()

    # Zelfde vorm als wat de app exporteert, zodat dit bestand ook via de
    # gewone importknop ingelezen kan worden.
    out = {
        "v": 1,
        "app": "kracht",
        "source": src.name,
        "categories": cats,
        "exercises": exercises,
        "sets": sets,
        "routines": [],
        "gear": {"bar": bar[0] if bar else 20, "plates": plates},
        "settings": {"targetSets": 3, "targetReps": 10, "unit": "kg"},
    }

    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    days = len({s["d"] for s in sets})
    print(f"{dst}  ->  {len(sets)} sets / {days} trainingsdagen / "
          f"{len(exercises)} oefeningen / {dst.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    src = Path(sys.argv[1] if len(sys.argv) > 1 else "FitNotes_Backup.fitnotes")
    dst = Path(sys.argv[2] if len(sys.argv) > 2 else "data/seed.json")
    convert(src, dst)
