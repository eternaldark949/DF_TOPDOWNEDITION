# Units

The engine's one length unit. Every position, size, radius, speed and height in every level is in **world units**. Mass is in kilograms, time in seconds and angles in radians.

| Export | What it is |
|---|---|
| `UNITS_PER_METRE` | How many world units make one metre: **50**, so one world unit is 2 cm. A character of radius 12 is 24 cm across the shoulders' half; a 3 m floor is 150 units. |
| `metres(n)`, `centimetres(n)` | World units in `n` metres or centimetres. |
| `toMetres(units)` | Metres in a number of world units. |
| `readLength(value)` | A number is already world units; a string `"1.75 m"` or `"24 cm"` is converted. Anything else throws. |
| `isLength(value)` | True for a string written as a length. |
| `readLengths(data)` | A copy of plain data with every length string turned into world units, at any depth. |

Data may write lengths either way: `"height": "1.75 m"` or `"height": 87.5`. The Directory runs `readLengths` over every library when it is registered, so nothing past loading ever sees a metre. Only a whole string that is a number and `m` or `cm` is a length; `"tall 3 m"` stays text.
