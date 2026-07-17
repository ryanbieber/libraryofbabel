# Unbounded world coordinates

## Context

The current world model restricts floors to `-1..1` and galleries to `-2..2`. Connectors at either end can have a missing neighbor, ordinary passages render locked grilles, and the stair direction is chosen partly from the finite floor boundary. Rendering is already mostly local: `visibleScenesForPose` returns the current zone and at most five adjacent zones at small, relative Three.js positions. Deterministic content and scenery use interpolated coordinate keys, while v1 saves persist JavaScript numbers.

## Coordinate model

Global floor, gallery, and connector coordinates use one validated `Coordinate` type backed by `bigint`. Helpers own parsing, signed arithmetic, comparison, canonical decimal formatting, and JSON-boundary validation. Only canonical base-10 strings (`0`, `-1`, `123`, never leading zeroes, exponents, decimals, or `-0`) are accepted by v2 persistence.

`FloorCoordinate`, `GalleryCoordinate`, and `ConnectorCoordinate` are semantic aliases of the same safe representation. Gallery/connector topology is total:

- the north connector of gallery `g` is `g - 1`;
- the south connector is `g`;
- connector `c` always joins north gallery `c` to south gallery `c + 1`;
- an adjacent floor is always `f - 1` or `f + 1`.

Local player offsets, yaw, stair-track distance, shelf indexes, book indexes, and page indexes remain bounded `number` values. These are physical or collection-local values, not global coordinates.

## Rendering and streaming

The player's current zone is the render origin. `visibleScenesForPose` constructs only the current zone and zones visible through its openings. Each `VisibleScene.position` remains a small local tuple derived from room dimensions; no global coordinate is converted to `number` or sent to Three.js. React keys combine a local role with the complete canonical global world key so adjacent scene identity remains deterministic after transitions.

Ordinary vestibules always have two gallery neighbors, so corridor end gates and boundary continuation geometry disappear. The lightwell and stair visual shells remain fixed-size atmospheric geometry. Their extent is a rendering budget, not a discoverable period or world boundary. No geometry, collider, interaction list, or scene list is created in proportion to coordinate magnitude.

The six-scene cap remains:

- gallery: current gallery plus two vestibules;
- vestibule: current vestibule, two galleries, two service rooms, and one stair entrance;
- service room: current room plus its vestibule;
- stair: current stair plus both landings.

## Movement

Gallery/vestibule transitions use total connector arithmetic and cannot hit an end gate. At every vestibule the north stair lane ascends to `floor + 1` and the south lane descends to `floor - 1`, independent of current floor. Stair completion changes only the global floor coordinate; camera movement stays within one locally rendered flight.

## Deterministic identity and compatibility

Complete canonical coordinates participate in world, NPC, incident, book-content, and cover seeds. Interpolating a `bigint` produces the same decimal spelling as the former safe integer for all legacy coordinates, so existing origin-era keys remain byte-for-byte identical.

Generator versions are explicit:

- book content remains `legacy-v1`; its historical seed format is deliberately unchanged;
- cover inscriptions remain `v1`, including their existing `cover-inscription:v1:` domain prefix;
- world-derived NPC and incident strategies are identified as `v1` and retain their existing seed formats.

Future generator changes must introduce a new version and a compatibility dispatch rather than modifying a historical version in place. Tests pin representative legacy-origin page lines, covers, NPCs, incidents, and world keys before and after the coordinate migration.

## Save format and migration

The v2 save key is `library-of-babel:save:v2`. Every global coordinate in the pose, zone, selected book, and word-finding address is serialized as a canonical decimal string. Bounded local values remain numbers. Reads try v2 first, then v1.

A valid v1 save is migrated in memory by converting every legacy integer coordinate to `bigint`; quest status, selected book, word finding, local pose fields, and in-progress stair distance are preserved. The existing stair-progress compatibility conversion runs before v1 validation. The next autosave writes v2. v1 storage is left intact until an explicit journey clear, which removes both keys, so a failed v2 write cannot destroy the last usable save.

Malformed coordinates, noncanonical strings, invalid local values, and internally inconsistent stair endpoints are rejected. V2 serialization never passes `bigint` directly to `JSON.stringify`.

## HUD and address input

HUD, plaques, dialogue labels, and book addresses format coordinates directly from canonical decimal text, adding `+` only for positive signed labels. Address forms parse canonical signed integers without first converting through `number`, allowing very large positive and negative coordinates.

## Verification

Unit coverage includes negative and far-beyond-safe-integer coordinates, canonical serialization, connector arithmetic, former gallery/floor boundaries, stair traversal in both directions, bounded adjacent-scene construction, stable world keys, v1-to-v2 migration, v2 round trips, and pinned legacy book identity. Browser QA traverses many galleries and floors in both directions, saves and reloads, checks large signed labels, inspects desktop and mobile-landscape WebGL output, and repeatedly samples renderer object/draw-call/geometry/texture counters while stationary to confirm no growth.
