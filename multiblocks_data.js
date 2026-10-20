/**
 * ASTRAL RPG — 3D Multiblocks & In-World Structures Database
 * 12 interactive structures across Twilight Forest, The Aether, The Undergarden,
 * BetterEnd, Create, Malum, Cataclysm, Wither Storm, and Vanilla.
 */
const _root = typeof window !== 'undefined' ? window : global;
_root.ASTRAL_MULTIBLOCKS = [
  {
    id: "wither_storm",
    name: "Призыв Иссушающей Бури",
    mod: "Wither Storm Mod",
    category: "bosses",
    dimensions: "3 × 3 × 1",
    icon: "assets/recipes_icons/command_block.png",
    subtitle: "Алтарь пробуждения Колосса",
    description: "Классический алтарь призыва Иссушителя, в центре которого вместо песка душ установлен Командный блок. При установке последнего черепа оживает Иссушающая Буря.",
    guide: "1. Поставьте 1 блок Песка душ на землю (основание).\n2. На него по бокам поставьте 2 блока Песка душ, а строго в центр — Командный блок.\n3. Сверху на три блока установите 3 Черепа скелета-иссушителя.\n⚠️ Внимание: Буря немедленно начнёт расти и поглощать блоки вокруг!",
    command: "/summon witherstormmod:wither_storm ~ ~ ~",
    materials: [
      { id: "minecraft:soul_sand", name: "Песок душ", icon: "assets/recipes_icons/soul_sand.png", count: 4 },
      { id: "minecraft:command_block", name: "Командный блок", icon: "assets/recipes_icons/command_block.png", count: 1 },
      { id: "minecraft:wither_skeleton_skull", name: "Череп скелета-иссушителя", icon: "assets/recipes_icons/wither_skeleton_skull.png", count: 3 }
    ],
    blocks: [
      { x: 0, y: 0, z: 0, id: "minecraft:soul_sand", name: "Песок душ (Основа)", color: 0x544033, icon: "assets/recipes_icons/soul_sand.png" },
      { x: -1, y: 1, z: 0, id: "minecraft:soul_sand", name: "Песок душ (Левое плечо)", color: 0x544033, icon: "assets/recipes_icons/soul_sand.png" },
      { x: 0, y: 1, z: 0, id: "minecraft:command_block", name: "Командный блок (Ядро)", color: 0xc87548, icon: "assets/recipes_icons/command_block.png" },
      { x: 1, y: 1, z: 0, id: "minecraft:soul_sand", name: "Песок душ (Правое плечо)", color: 0x544033, icon: "assets/recipes_icons/soul_sand.png" },
      { x: -1, y: 2, z: 0, id: "minecraft:wither_skeleton_skull", name: "Череп иссушителя 1", color: 0x222222, icon: "assets/recipes_icons/wither_skeleton_skull.png" },
      { x: 0, y: 2, z: 0, id: "minecraft:wither_skeleton_skull", name: "Череп иссушителя (Центр)", color: 0x222222, icon: "assets/recipes_icons/wither_skeleton_skull.png" },
      { x: 1, y: 2, z: 0, id: "minecraft:wither_skeleton_skull", name: "Череп иссушителя 2", color: 0x222222, icon: "assets/recipes_icons/wither_skeleton_skull.png" }
    ]
  },
  {
    id: "twilight_portal",
    name: "Портал в Сумеречный Лес",
    mod: "Twilight Forest",
    category: "portals",
    dimensions: "4 × 1 × 4",
    icon: "assets/recipes_icons/twilight_portal_square.png",
    subtitle: "Цветочный бассейн перехода",
    description: "Древний ритуальный бассейн, соединяющий обычный мир с вечными сумерками и волшебным лесом.",
    guide: "1. Выкопайте в земле яму 2×2 глубиной в 1 блок и залейте её 4 вёдрами воды, чтобы получилось стоячее зеркало воды.\n2. По всему периметру (12 блоков вокруг) посадите любые цветы, грибы или саженцы.\n3. Бросьте в воду один Алмаз (Q). Блеснёт молния и вода превратится в мерцающий портал!",
    command: "/give @p minecraft:diamond 1",
    materials: [
      { id: "minecraft:water_bucket", name: "Ведро воды (4 источника)", icon: "assets/recipes_icons/water_bucket.png", count: 4 },
      { id: "minecraft:poppy", name: "Цветы / Растения", icon: "assets/recipes_icons/poppy.png", count: 12 },
      { id: "minecraft:grass_block", name: "Блок дёрна (Берег)", icon: "assets/recipes_icons/grass_block.png", count: 12 },
      { id: "minecraft:diamond", name: "Алмаз (Активатор)", icon: "assets/recipes_icons/diamond.png", count: 1 }
    ],
    blocks: [
      // 2x2 water inside
      { x: 0, y: 0, z: 0, id: "minecraft:water", name: "Вода портала", color: 0x38bdf8, icon: "assets/recipes_icons/water.png" },
      { x: 1, y: 0, z: 0, id: "minecraft:water", name: "Вода портала", color: 0x38bdf8, icon: "assets/recipes_icons/water.png" },
      { x: 0, y: 0, z: 1, id: "minecraft:water", name: "Вода портала", color: 0x38bdf8, icon: "assets/recipes_icons/water.png" },
      { x: 1, y: 0, z: 1, id: "minecraft:water", name: "Вода портала", color: 0x38bdf8, icon: "assets/recipes_icons/water.png" },
      // Ring of 12 flowers around
      { x: -1, y: 0, z: -1, id: "minecraft:poppy", name: "Мак", color: 0xef4444, icon: "assets/recipes_icons/poppy.png" },
      { x: 0, y: 0, z: -1, id: "minecraft:dandelion", name: "Одуванчик", color: 0xfacc15, icon: "assets/recipes_icons/dandelion.png" },
      { x: 1, y: 0, z: -1, id: "minecraft:blue_orchid", name: "Синяя орхидея", color: 0x38bdf8, icon: "assets/recipes_icons/blue_orchid.png" },
      { x: 2, y: 0, z: -1, id: "minecraft:allium", name: "Лук-батун", color: 0xc084fc, icon: "assets/recipes_icons/allium.png" },
      { x: 2, y: 0, z: 0, id: "minecraft:red_tulip", name: "Красный тюльпан", color: 0xf43f5e, icon: "assets/recipes_icons/red_tulip.png" },
      { x: 2, y: 0, z: 1, id: "minecraft:orange_tulip", name: "Оранжевый тюльпан", color: 0xf97316, icon: "assets/recipes_icons/orange_tulip.png" },
      { x: 2, y: 0, z: 2, id: "minecraft:cornflower", name: "Василёк", color: 0x3b82f6, icon: "assets/recipes_icons/cornflower.png" },
      { x: 1, y: 0, z: 2, id: "minecraft:oxeye_daisy", name: "Ромашка", color: 0xf8fafc, icon: "assets/recipes_icons/oxeye_daisy.png" },
      { x: 0, y: 0, z: 2, id: "minecraft:pink_tulip", name: "Розовый тюльпан", color: 0xf472b6, icon: "assets/recipes_icons/pink_tulip.png" },
      { x: -1, y: 0, z: 2, id: "minecraft:white_tulip", name: "Белый тюльпан", color: 0xe2e8f0, icon: "assets/recipes_icons/white_tulip.png" },
      { x: -1, y: 0, z: 1, id: "minecraft:red_mushroom", name: "Красный гриб", color: 0xdc2626, icon: "assets/recipes_icons/red_mushroom.png" },
      { x: -1, y: 0, z: 0, id: "minecraft:brown_mushroom", name: "Коричневый гриб", color: 0x92400e, icon: "assets/recipes_icons/brown_mushroom.png" }
    ]
  },
  {
    id: "aether_portal",
    name: "Портал в Рай (The Aether)",
    mod: "The Aether",
    category: "portals",
    dimensions: "4 × 5 × 1",
    icon: "assets/recipes_icons/aether_portal_square.png",
    subtitle: "Небесная арка из светокамня",
    description: "Портал на парящие острова Аэзера. По форме идентичен порталу в Незер, но строится из светящегося камня и активируется чистой водой.",
    guide: "1. Постройте вертикальную рамку шириной 4 блока и высотой 5 блоков из Светокамня (Glowstone).\n2. Внутренний проём должен быть 2×3 блока.\n3. Возьмите Ведро воды и вылейте его в нижний блок рамки.\n4. Вода заполнит рамку мерцающим сияющим вихрем перехода.",
    command: "/give @p minecraft:water_bucket 1",
    materials: [
      { id: "minecraft:glowstone", name: "Светокамень (Glowstone)", icon: "assets/recipes_icons/glowstone.png", count: 14 },
      { id: "minecraft:water_bucket", name: "Ведро воды (Активатор)", icon: "assets/recipes_icons/water_bucket.png", count: 1 }
    ],
    blocks: [
      // Bottom frame
      { x: 0, y: 0, z: 0, id: "minecraft:glowstone", name: "Светокамень (Основа)", color: 0xfacc15, icon: "assets/recipes_icons/glowstone.png" },
      { x: 1, y: 0, z: 0, id: "minecraft:glowstone", name: "Светокамень (Основа)", color: 0xfacc15, icon: "assets/recipes_icons/glowstone.png" },
      { x: 2, y: 0, z: 0, id: "minecraft:glowstone", name: "Светокамень (Основа)", color: 0xfacc15, icon: "assets/recipes_icons/glowstone.png" },
      { x: 3, y: 0, z: 0, id: "minecraft:glowstone", name: "Светокамень (Основа)", color: 0xfacc15, icon: "assets/recipes_icons/glowstone.png" },
      // Side pillars
      { x: 0, y: 1, z: 0, id: "minecraft:glowstone", name: "Светокамень (Стойка)", color: 0xfacc15, icon: "assets/recipes_icons/glowstone.png" },
      { x: 3, y: 1, z: 0, id: "minecraft:glowstone", name: "Светокамень (Стойка)", color: 0xfacc15, icon: "assets/recipes_icons/glowstone.png" },
      { x: 0, y: 2, z: 0, id: "minecraft:glowstone", name: "Светокамень (Стойка)", color: 0xfacc15, icon: "assets/recipes_icons/glowstone.png" },
      { x: 3, y: 2, z: 0, id: "minecraft:glowstone", name: "Светокамень (Стойка)", color: 0xfacc15, icon: "assets/recipes_icons/glowstone.png" },
      { x: 0, y: 3, z: 0, id: "minecraft:glowstone", name: "Светокамень (Стойка)", color: 0xfacc15, icon: "assets/recipes_icons/glowstone.png" },
      { x: 3, y: 3, z: 0, id: "minecraft:glowstone", name: "Светокамень (Стойка)", color: 0xfacc15, icon: "assets/recipes_icons/glowstone.png" },
      // Top frame
      { x: 0, y: 4, z: 0, id: "minecraft:glowstone", name: "Светокамень (Верх)", color: 0xfacc15, icon: "assets/recipes_icons/glowstone.png" },
      { x: 1, y: 4, z: 0, id: "minecraft:glowstone", name: "Светокамень (Верх)", color: 0xfacc15, icon: "assets/recipes_icons/glowstone.png" },
      { x: 2, y: 4, z: 0, id: "minecraft:glowstone", name: "Светокамень (Верх)", color: 0xfacc15, icon: "assets/recipes_icons/glowstone.png" },
      { x: 3, y: 4, z: 0, id: "minecraft:glowstone", name: "Светокамень (Верх)", color: 0xfacc15, icon: "assets/recipes_icons/glowstone.png" },
      // Inner portal water (2x3)
      { x: 1, y: 1, z: 0, id: "aether:portal", name: "Поле портала Аэзера", color: 0x38bdf8, icon: "assets/recipes_icons/water_bucket.png" },
      { x: 2, y: 1, z: 0, id: "aether:portal", name: "Поле портала Аэзера", color: 0x38bdf8, icon: "assets/recipes_icons/water_bucket.png" },
      { x: 1, y: 2, z: 0, id: "aether:portal", name: "Поле портала Аэзера", color: 0x38bdf8, icon: "assets/recipes_icons/water_bucket.png" },
      { x: 2, y: 2, z: 0, id: "aether:portal", name: "Поле портала Аэзера", color: 0x38bdf8, icon: "assets/recipes_icons/water_bucket.png" },
      { x: 1, y: 3, z: 0, id: "aether:portal", name: "Поле портала Аэзера", color: 0x38bdf8, icon: "assets/recipes_icons/water_bucket.png" },
      { x: 2, y: 3, z: 0, id: "aether:portal", name: "Поле портала Аэзера", color: 0x38bdf8, icon: "assets/recipes_icons/water_bucket.png" }
    ]
  },
  {
    id: "undergarden_portal",
    name: "Портал в Андергарден",
    mod: "The Undergarden",
    category: "portals",
    dimensions: "4 × 5 × 1",
    icon: "assets/recipes_icons/catalyst.png",
    subtitle: "Монолитная каменная арка глубин",
    description: "Врата в забытые подземные глубины Андергардена. Сооружаются из каменных кирпичей и активируются древним Катализатором.",
    guide: "1. Постройте рамку 4×5 блоков из Каменных кирпичей (Stone Bricks) с проёмом 2×3 блока.\n2. Скрафтите Катализатор (Catalyst) из золотых слитков и бриллианта.\n3. Кликните ПКМ Катализатором по внутреннему нижнему краю рамки.",
    command: "/give @p undergarden:catalyst 1",
    materials: [
      { id: "minecraft:stone_bricks", name: "Каменные кирпичи", icon: "assets/recipes_icons/stone_bricks.png", count: 14 },
      { id: "undergarden:catalyst", name: "Катализатор (Активатор)", icon: "assets/recipes_icons/catalyst.png", count: 1 }
    ],
    blocks: [
      { x: 0, y: 0, z: 0, id: "minecraft:stone_bricks", name: "Каменные кирпичи", color: 0x6b7280, icon: "assets/recipes_icons/stone_bricks.png" },
      { x: 1, y: 0, z: 0, id: "minecraft:stone_bricks", name: "Каменные кирпичи", color: 0x6b7280, icon: "assets/recipes_icons/stone_bricks.png" },
      { x: 2, y: 0, z: 0, id: "minecraft:stone_bricks", name: "Каменные кирпичи", color: 0x6b7280, icon: "assets/recipes_icons/stone_bricks.png" },
      { x: 3, y: 0, z: 0, id: "minecraft:stone_bricks", name: "Каменные кирпичи", color: 0x6b7280, icon: "assets/recipes_icons/stone_bricks.png" },
      { x: 0, y: 1, z: 0, id: "minecraft:stone_bricks", name: "Каменные кирпичи", color: 0x6b7280, icon: "assets/recipes_icons/stone_bricks.png" },
      { x: 3, y: 1, z: 0, id: "minecraft:stone_bricks", name: "Каменные кирпичи", color: 0x6b7280, icon: "assets/recipes_icons/stone_bricks.png" },
      { x: 0, y: 2, z: 0, id: "minecraft:stone_bricks", name: "Каменные кирпичи", color: 0x6b7280, icon: "assets/recipes_icons/stone_bricks.png" },
      { x: 3, y: 2, z: 0, id: "minecraft:stone_bricks", name: "Каменные кирпичи", color: 0x6b7280, icon: "assets/recipes_icons/stone_bricks.png" },
      { x: 0, y: 3, z: 0, id: "minecraft:stone_bricks", name: "Каменные кирпичи", color: 0x6b7280, icon: "assets/recipes_icons/stone_bricks.png" },
      { x: 3, y: 3, z: 0, id: "minecraft:stone_bricks", name: "Каменные кирпичи", color: 0x6b7280, icon: "assets/recipes_icons/stone_bricks.png" },
      { x: 0, y: 4, z: 0, id: "minecraft:stone_bricks", name: "Каменные кирпичи", color: 0x6b7280, icon: "assets/recipes_icons/stone_bricks.png" },
      { x: 1, y: 4, z: 0, id: "minecraft:stone_bricks", name: "Каменные кирпичи", color: 0x6b7280, icon: "assets/recipes_icons/stone_bricks.png" },
      { x: 2, y: 4, z: 0, id: "minecraft:stone_bricks", name: "Каменные кирпичи", color: 0x6b7280, icon: "assets/recipes_icons/stone_bricks.png" },
      { x: 3, y: 4, z: 0, id: "minecraft:stone_bricks", name: "Каменные кирпичи", color: 0x6b7280, icon: "assets/recipes_icons/stone_bricks.png" },
      // Portal energy
      { x: 1, y: 1, z: 0, id: "undergarden:portal", name: "Энергия Андергардена", color: 0x10b981, icon: "assets/recipes_icons/catalyst.png" },
      { x: 2, y: 1, z: 0, id: "undergarden:portal", name: "Энергия Андергардена", color: 0x10b981, icon: "assets/recipes_icons/catalyst.png" },
      { x: 1, y: 2, z: 0, id: "undergarden:portal", name: "Энергия Андергардена", color: 0x10b981, icon: "assets/recipes_icons/catalyst.png" },
      { x: 2, y: 2, z: 0, id: "undergarden:portal", name: "Энергия Андергардена", color: 0x10b981, icon: "assets/recipes_icons/catalyst.png" },
      { x: 1, y: 3, z: 0, id: "undergarden:portal", name: "Энергия Андергардена", color: 0x10b981, icon: "assets/recipes_icons/catalyst.png" },
      { x: 2, y: 3, z: 0, id: "undergarden:portal", name: "Энергия Андергардена", color: 0x10b981, icon: "assets/recipes_icons/catalyst.png" }
    ]
  },
  {
    id: "create_crushing_wheel_array",
    name: "Механический Сборщик 5×5 (Дробящие колёса)",
    mod: "Create",
    category: "create",
    dimensions: "5 × 5 × 1",
    icon: "assets/recipes_icons/crushing_wheel.png",
    subtitle: "Сетка мультиблочного крафта Create",
    description: "Массив из 21 Механического сборщика Create в форме ромба 5×5. Единственный способ изготовить Дробящие колёса.",
    guide: "1. Выставите 21 блок Механических сборщиков (Mechanical Crafters) ромбом на стене или на полу.\n2. Возьмите Гаечный ключ (Wrench) и настройте стрелки всех сборщиков так, чтобы они вели к нижнему центральному блоку.\n3. Подведите кинетическое вращение (Shaft / Cogwheel).\n4. Заложите ингредиенты в соответствующие ячейки: латунные слитки, андезитовый сплав и древесину.",
    command: "/give @p create:mechanical_crafter 21",
    materials: [
      { id: "create:mechanical_crafter", name: "Механический сборщик", icon: "assets/recipes_icons/mechanical_crafter.png", count: 21 },
      { id: "create:brass_ingot", name: "Латунный слиток", icon: "assets/recipes_icons/brass_ingot.png", count: 16 },
      { id: "create:andesite_alloy", name: "Андезитовый сплав", icon: "assets/recipes_icons/andesite_alloy.png", count: 1 },
      { id: "minecraft:oak_planks", name: "Дубовые доски", icon: "assets/recipes_icons/oak_planks.png", count: 4 }
    ],
    blocks: (function() {
      const b = [];
      const pat = [
        [0, 1, 1, 1, 0],
        [1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1],
        [0, 1, 1, 1, 0]
      ];
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
          if (pat[r][c]) {
            b.push({
              x: c - 2,
              y: 4 - r,
              z: 0,
              id: "create:mechanical_crafter",
              name: `Сборщик [Кол ${c+1}, Ряд ${5-r}]`,
              color: 0x9a6b42,
              icon: "assets/recipes_icons/mechanical_crafter.png"
            });
          }
        }
      }
      return b;
    })()
  },
  {
    id: "create_extendo_grip_array",
    name: "Механический Сборщик 3×5 (Экстендо-рука)",
    mod: "Create",
    category: "create",
    dimensions: "3 × 5 × 1",
    icon: "assets/recipes_icons/extendo_grip.png",
    subtitle: "Вертикальный сборщик манипулятора",
    description: "Матрица 3×5 блоков Механических сборщиков Create для крафта Экстендо-руки, увеличивающей дальность атаки и взаимодействия.",
    guide: "1. Постройте вертикальную сетку 3×5 из 15 Механических сборщиков.\n2. Настройте стрелки схождения гаечным ключом к основанию.\n3. Подайте вращение и выложите латунные руки, палки и медные пластины.",
    command: "/give @p create:mechanical_crafter 15",
    materials: [
      { id: "create:mechanical_crafter", name: "Механический сборщик", icon: "assets/recipes_icons/mechanical_crafter.png", count: 15 },
      { id: "create:brass_hand", name: "Латунная рука", icon: "assets/recipes_icons/brass_hand.png", count: 1 },
      { id: "create:copper_sheet", name: "Медный лист", icon: "assets/recipes_icons/copper_sheet.png", count: 4 },
      { id: "minecraft:stick", name: "Палка", icon: "assets/recipes_icons/stick.png", count: 4 }
    ],
    blocks: (function() {
      const b = [];
      for (let y = 0; y < 5; y++) {
        for (let x = -1; x <= 1; x++) {
          b.push({
            x: x,
            y: y,
            z: 0,
            id: "create:mechanical_crafter",
            name: `Сборщик [X:${x+2}, Y:${y+1}]`,
            color: 0x9a6b42,
            icon: "assets/recipes_icons/mechanical_crafter.png"
          });
        }
      }
      return b;
    })()
  },
  {
    id: "malum_spirit_altar",
    name: "Алтарь Духов (Spirit Altar)",
    mod: "Malum",
    category: "altars",
    dimensions: "5 × 2 × 5",
    icon: "assets/recipes_icons/spirit_altar.png",
    subtitle: "Магический комплекс инфузии душ",
    description: "Центральный ритуальный комплекс мода Malum. Позволяет зачаровывать и преобразовывать предметы силой духов при помощи окружающих пьедесталов.",
    guide: "1. В центре установите блок Spirit Altar.\n2. На расстоянии 2 блоков крестом поставьте 4 пьедестала из древесины рун (Runewood Pedestals).\n3. По углам (шаг 2 по диагонали) установите резные рунические колонны (Runed Pillars).\n4. Положите базовый предмет и духи в центр, ингредиенты — на пьедесталы. Кликните ПКМ пустой рукой для активации!",
    command: "/give @p malum:spirit_altar 1",
    materials: [
      { id: "malum:spirit_altar", name: "Алтарь Духов", icon: "assets/recipes_icons/spirit_altar.png", count: 1 },
      { id: "malum:runewood_item_pedestal", name: "Пьедестал из древесины рун", icon: "assets/recipes_icons/runewood_item_pedestal.png", count: 4 },
      { id: "malum:runed_runewood_log", name: "Резное бревно рунного дерева", icon: "assets/recipes_icons/runed_runewood_log.png", count: 4 },
      { id: "malum:runewood_planks", name: "Рунные доски (Основа)", icon: "assets/recipes_icons/runewood_planks.png", count: 9 }
    ],
    blocks: [
      // Base floor 5x5 outline / decorative
      { x: 0, y: 0, z: 0, id: "malum:runewood_planks", name: "Рунные доски", color: 0x4a382a, icon: "assets/recipes_icons/runewood_planks.png" },
      { x: -2, y: 0, z: 0, id: "malum:runewood_planks", name: "Рунные доски", color: 0x4a382a, icon: "assets/recipes_icons/runewood_planks.png" },
      { x: 2, y: 0, z: 0, id: "malum:runewood_planks", name: "Рунные доски", color: 0x4a382a, icon: "assets/recipes_icons/runewood_planks.png" },
      { x: 0, y: 0, z: -2, id: "malum:runewood_planks", name: "Рунные доски", color: 0x4a382a, icon: "assets/recipes_icons/runewood_planks.png" },
      { x: 0, y: 0, z: 2, id: "malum:runewood_planks", name: "Рунные доски", color: 0x4a382a, icon: "assets/recipes_icons/runewood_planks.png" },
      // Corner pillars y=0 and y=1
      { x: -2, y: 0, z: -2, id: "malum:runed_runewood_log", name: "Резная колонна СЗ", color: 0x8b5cf6, icon: "assets/recipes_icons/runed_runewood_log.png" },
      { x: 2, y: 0, z: -2, id: "malum:runed_runewood_log", name: "Резная колонна СВ", color: 0x8b5cf6, icon: "assets/recipes_icons/runed_runewood_log.png" },
      { x: -2, y: 0, z: 2, id: "malum:runed_runewood_log", name: "Резная колонна ЮЗ", color: 0x8b5cf6, icon: "assets/recipes_icons/runed_runewood_log.png" },
      { x: 2, y: 0, z: 2, id: "malum:runed_runewood_log", name: "Резная колонна ЮВ", color: 0x8b5cf6, icon: "assets/recipes_icons/runed_runewood_log.png" },
      // Level 1: Central Altar and 4 Pedestals
      { x: 0, y: 1, z: 0, id: "malum:spirit_altar", name: "Алтарь Духов (Центр)", color: 0xa855f7, icon: "assets/recipes_icons/spirit_altar.png" },
      { x: -2, y: 1, z: 0, id: "malum:runewood_item_pedestal", name: "Пьедестал (Запад)", color: 0x634d3b, icon: "assets/recipes_icons/runewood_item_pedestal.png" },
      { x: 2, y: 1, z: 0, id: "malum:runewood_item_pedestal", name: "Пьедестал (Восток)", color: 0x634d3b, icon: "assets/recipes_icons/runewood_item_pedestal.png" },
      { x: 0, y: 1, z: -2, id: "malum:runewood_item_pedestal", name: "Пьедестал (Север)", color: 0x634d3b, icon: "assets/recipes_icons/runewood_item_pedestal.png" },
      { x: 0, y: 1, z: 2, id: "malum:runewood_item_pedestal", name: "Пьедестал (Юг)", color: 0x634d3b, icon: "assets/recipes_icons/runewood_item_pedestal.png" },
      { x: -2, y: 1, z: -2, id: "malum:runed_runewood_log", name: "Резная колонна (Верх)", color: 0xa855f7, icon: "assets/recipes_icons/runed_runewood_log.png" },
      { x: 2, y: 1, z: -2, id: "malum:runed_runewood_log", name: "Резная колонна (Верх)", color: 0xa855f7, icon: "assets/recipes_icons/runed_runewood_log.png" },
      { x: -2, y: 1, z: 2, id: "malum:runed_runewood_log", name: "Резная колонна (Верх)", color: 0xa855f7, icon: "assets/recipes_icons/runed_runewood_log.png" },
      { x: 2, y: 1, z: 2, id: "malum:runed_runewood_log", name: "Резная колонна (Верх)", color: 0xa855f7, icon: "assets/recipes_icons/runed_runewood_log.png" }
    ]
  },
  {
    id: "betterend_infusion_altar",
    name: "Алтарь Наполнения (BetterEnd)",
    mod: "BetterEnd",
    category: "altars",
    dimensions: "5 × 2 × 5",
    icon: "assets/recipes_icons/infusion_pedestal.png",
    subtitle: "Алтарь кристаллического слияния",
    description: "Мощный мультиблочный алтарь измерения Энда. Насыщает инструменты и броню свойствами редких энд-кристаллов.",
    guide: "1. Установите 1 Пьедестал слияния (Infusion Pedestal) в центр.\n2. По кругу вокруг него на радиусе 2 блока установите 8 обычных пьедесталов.\n3. Положите предмет в центр и 8 реагентов на пьедесталы. Кликните ПКМ по центральному пьедесталу.",
    command: "/give @p betterend:infusion_pedestal 1",
    materials: [
      { id: "betterend:infusion_pedestal", name: "Пьедестал слияния", icon: "assets/recipes_icons/infusion_pedestal.png", count: 1 },
      { id: "betterend:flavolite_pedestal", name: "Пьедестал из флаволита", icon: "assets/recipes_icons/pedestal.png", count: 8 },
      { id: "betterend:flavolite_tiles", name: "Плитка из флаволита", icon: "assets/recipes_icons/flavolite_tiles.png", count: 9 }
    ],
    blocks: [
      { x: 0, y: 0, z: 0, id: "betterend:flavolite_tiles", name: "Плитка флаволита", color: 0x9ca3af, icon: "assets/recipes_icons/flavolite_tiles.png" },
      { x: 0, y: 1, z: 0, id: "betterend:infusion_pedestal", name: "Пьедестал слияния (Центр)", color: 0x38bdf8, icon: "assets/recipes_icons/infusion_pedestal.png" },
      { x: -2, y: 1, z: 0, id: "betterend:pedestal", name: "Пьедестал (Запад)", color: 0xd1d5db, icon: "assets/recipes_icons/pedestal.png" },
      { x: 2, y: 1, z: 0, id: "betterend:pedestal", name: "Пьедестал (Восток)", color: 0xd1d5db, icon: "assets/recipes_icons/pedestal.png" },
      { x: 0, y: 1, z: -2, id: "betterend:pedestal", name: "Пьедестал (Север)", color: 0xd1d5db, icon: "assets/recipes_icons/pedestal.png" },
      { x: 0, y: 1, z: 2, id: "betterend:pedestal", name: "Пьедестал (Юг)", color: 0xd1d5db, icon: "assets/recipes_icons/pedestal.png" },
      { x: -1, y: 1, z: -1, id: "betterend:pedestal", name: "Пьедестал (СЗ)", color: 0xd1d5db, icon: "assets/recipes_icons/pedestal.png" },
      { x: 1, y: 1, z: -1, id: "betterend:pedestal", name: "Пьедестал (СВ)", color: 0xd1d5db, icon: "assets/recipes_icons/pedestal.png" },
      { x: -1, y: 1, z: 1, id: "betterend:pedestal", name: "Пьедестал (ЮЗ)", color: 0xd1d5db, icon: "assets/recipes_icons/pedestal.png" },
      { x: 1, y: 1, z: 1, id: "betterend:pedestal", name: "Пьедестал (ЮВ)", color: 0xd1d5db, icon: "assets/recipes_icons/pedestal.png" }
    ]
  },
  {
    id: "create_steam_boiler",
    name: "Паровой Котёл 3×3 (Create Boiler)",
    mod: "Create",
    category: "create",
    dimensions: "3 × 4 × 3",
    icon: "assets/recipes_icons/steam_engine.png",
    subtitle: "Мощнейший источник кинетической энергии",
    description: "Многоблочный паровой котёл 3×3×2 с подогревом от Горелок сполохов и 4 Паровыми двигателями. Обеспечивает максимальный уровень выработки SU.",
    guide: "1. Установите 9 Горелок сполоха (Blaze Burners) на нижнем ярусе 3×3.\n2. На них постройте резервуар 3×3×2 из Жидкостных баков (Fluid Tanks).\n3. Сверху и по бокам установите Паровые двигатели (Steam Engines).\n4. Подведите воду помпой и подайте уголь горелкам.",
    command: "/give @p create:fluid_tank 18",
    materials: [
      { id: "create:fluid_tank", name: "Жидкостный бак (Fluid Tank)", icon: "assets/recipes_icons/fluid_tank.png", count: 18 },
      { id: "create:blaze_burner", name: "Горелка сполоха (Blaze Burner)", icon: "assets/recipes_icons/blaze_burner.png", count: 9 },
      { id: "create:steam_engine", name: "Паровой двигатель", icon: "assets/recipes_icons/steam_engine.png", count: 4 }
    ],
    blocks: (function() {
      const b = [];
      for (let x = -1; x <= 1; x++) {
        for (let z = -1; z <= 1; z++) {
          b.push({ x, y: 0, z, id: "create:blaze_burner", name: "Горелка сполоха", color: 0xf97316, icon: "assets/recipes_icons/blaze_burner.png" });
        }
      }
      for (let y = 1; y <= 2; y++) {
        for (let x = -1; x <= 1; x++) {
          for (let z = -1; z <= 1; z++) {
            b.push({ x, y, z, id: "create:fluid_tank", name: `Бак котла [Слой ${y}]`, color: 0xb45309, icon: "assets/recipes_icons/fluid_tank.png" });
          }
        }
      }
      b.push({ x: 0, y: 3, z: -1, id: "create:steam_engine", name: "Паровой двигатель (С)", color: 0xeab308, icon: "assets/recipes_icons/steam_engine.png" });
      b.push({ x: 0, y: 3, z: 1, id: "create:steam_engine", name: "Паровой двигатель (Ю)", color: 0xeab308, icon: "assets/recipes_icons/steam_engine.png" });
      b.push({ x: -1, y: 3, z: 0, id: "create:steam_engine", name: "Паровой двигатель (З)", color: 0xeab308, icon: "assets/recipes_icons/steam_engine.png" });
      b.push({ x: 1, y: 3, z: 0, id: "create:steam_engine", name: "Паровой двигатель (В)", color: 0xeab308, icon: "assets/recipes_icons/steam_engine.png" });
      return b;
    })()
  },
  {
    id: "conduit_monument",
    name: "Морской Проводник (Conduit Frame)",
    mod: "Minecraft Vanilla",
    category: "bosses",
    dimensions: "5 × 5 × 5",
    icon: "assets/recipes_icons/conduit.png",
    subtitle: "Подводный монумент дыхания и защиты",
    description: "Многоблочный каркас из 3 призмариновых колец, активирующий силу Морского проводника. Дарует бесконечное дыхание, зрение и защиту от утопленников.",
    guide: "1. Поместите блок Проводника (Conduit) в центр 5×5×5 под водой.\n2. Постройте кольцо 5×5 по оси X из Призмарина.\n3. Постройте второе кольцо 5×5 по оси Z.\n4. Постройте третье горизонтальное кольцо 5×5.\n5. Око проводника раскроется и начнёт атаковать врагов!",
    command: "/give @p minecraft:conduit 1",
    materials: [
      { id: "minecraft:conduit", name: "Морской проводник", icon: "assets/recipes_icons/conduit.png", count: 1 },
      { id: "minecraft:prismarine", name: "Призмарин / Морской фонарь", icon: "assets/recipes_icons/prismarine.png", count: 42 }
    ],
    blocks: (function() {
      const b = [];
      b.push({ x: 0, y: 2, z: 0, id: "minecraft:conduit", name: "Морской проводник (Сердце)", color: 0x38bdf8, icon: "assets/recipes_icons/conduit.png" });
      for (let i = -2; i <= 2; i++) {
        b.push({ x: i, y: 0, z: 0, id: "minecraft:prismarine", name: "Призмарин", color: 0x0d9488, icon: "assets/recipes_icons/prismarine.png" });
        b.push({ x: i, y: 4, z: 0, id: "minecraft:prismarine", name: "Призмарин", color: 0x0d9488, icon: "assets/recipes_icons/prismarine.png" });
        b.push({ x: -2, y: i+2, z: 0, id: "minecraft:prismarine", name: "Призмарин", color: 0x0d9488, icon: "assets/recipes_icons/prismarine.png" });
        b.push({ x: 2, y: i+2, z: 0, id: "minecraft:prismarine", name: "Призмарин", color: 0x0d9488, icon: "assets/recipes_icons/prismarine.png" });
      }
      for (let i = -2; i <= 2; i++) {
        b.push({ x: 0, y: 0, z: i, id: "minecraft:prismarine", name: "Призмарин", color: 0x0d9488, icon: "assets/recipes_icons/prismarine.png" });
        b.push({ x: 0, y: 4, z: i, id: "minecraft:prismarine", name: "Призмарин", color: 0x0d9488, icon: "assets/recipes_icons/prismarine.png" });
        b.push({ x: 0, y: i+2, z: -2, id: "minecraft:prismarine", name: "Призмарин", color: 0x0d9488, icon: "assets/recipes_icons/prismarine.png" });
        b.push({ x: 0, y: i+2, z: 2, id: "minecraft:prismarine", name: "Призмарин", color: 0x0d9488, icon: "assets/recipes_icons/prismarine.png" });
      }
      const map = new Map();
      b.forEach(item => {
        const k = `${item.x},${item.y},${item.z}`;
        if (!map.has(k)) map.set(k, item);
      });
      return Array.from(map.values());
    })()
  },
  {
    id: "malum_totem_pole",
    name: "Тотем Духов (Malum Totem Pole)",
    mod: "Malum",
    category: "altars",
    dimensions: "1 × 5 × 1",
    icon: "assets/recipes_icons/totem_base.png",
    subtitle: "Рунический столб стихийных аур",
    description: "Вертикальный рунический тотем, испускающий постоянную ауру благословения или проклятия на всю базу.",
    guide: "1. Установите основание тотема (Totem Base) на землю.\n2. Сверху вертикально поставьте от 1 до 4 брёвен рунного дерева (Runewood Log).\n3. Возьмите Рунический нож и вырежьте на каждом бревне руны духов.\n4. Тотем оживёт и начнёт распространять эффекты в радиусе 32 блоков.",
    command: "/give @p malum:totem_base 1",
    materials: [
      { id: "malum:totem_base", name: "Основание тотема", icon: "assets/recipes_icons/totem_base.png", count: 1 },
      { id: "malum:runewood_log", name: "Бревно рунного дерева", icon: "assets/recipes_icons/runewood_log.png", count: 4 }
    ],
    blocks: [
      { x: 0, y: 0, z: 0, id: "malum:totem_base", name: "Основание тотема", color: 0x4a382a, icon: "assets/recipes_icons/totem_base.png" },
      { x: 0, y: 1, z: 0, id: "malum:runewood_log", name: "Рунное бревно (Священный дух)", color: 0xfacc15, icon: "assets/recipes_icons/runewood_log.png" },
      { x: 0, y: 2, z: 0, id: "malum:runewood_log", name: "Рунное бревно (Тёмный дух)", color: 0x9333ea, icon: "assets/recipes_icons/runewood_log.png" },
      { x: 0, y: 3, z: 0, id: "malum:runewood_log", name: "Рунное бревно (Тайный дух)", color: 0x06b6d4, icon: "assets/recipes_icons/runewood_log.png" },
      { x: 0, y: 4, z: 0, id: "malum:runewood_log", name: "Вершина тотема (Дух земли)", color: 0x84cc16, icon: "assets/recipes_icons/runewood_log.png" }
    ]
  },
  {
    id: "cataclysm_altar_fire",
    name: "Алтарь Огня Игниса",
    mod: "L_Enders Cataclysm",
    category: "bosses",
    dimensions: "5 × 3 × 5",
    icon: "assets/recipes_icons/altar_of_fire.png",
    subtitle: "Арена призыва Пылающего Палача",
    description: "Древний алтарь пламени в центре Пылающей Цитадели (Burning Arena). При подношении Пылающего пепла пробуждает босса Игниса.",
    guide: "1. Найдите или воссоздайте Алтарь Огня из резного полированного чернита.\n2. Окружите алтарь четырьмя чашами с вечным пламенем.\n3. Поместите Пылающий пепел (Burning Ashes) на центральный алтарь.\n4. Начнётся битва с Игнисом!",
    command: "/give @p cataclysm:burning_ashes 1",
    materials: [
      { id: "cataclysm:altar_of_fire", name: "Алтарь Огня", icon: "assets/recipes_icons/altar_of_fire.png", count: 1 },
      { id: "minecraft:polished_blackstone_bricks", name: "Полированные чернитные кирпичи", icon: "assets/recipes_icons/polished_blackstone_bricks.png", count: 16 },
      { id: "cataclysm:burning_ashes", name: "Пылающий пепел (Активатор)", icon: "assets/recipes_icons/burning_ashes.png", count: 1 }
    ],
    blocks: [
      { x: 0, y: 0, z: 0, id: "minecraft:polished_blackstone_bricks", name: "Чернитное основание", color: 0x18181b, icon: "assets/recipes_icons/polished_blackstone_bricks.png" },
      { x: -1, y: 0, z: 0, id: "minecraft:polished_blackstone_bricks", name: "Чернитное основание", color: 0x18181b, icon: "assets/recipes_icons/polished_blackstone_bricks.png" },
      { x: 1, y: 0, z: 0, id: "minecraft:polished_blackstone_bricks", name: "Чернитное основание", color: 0x18181b, icon: "assets/recipes_icons/polished_blackstone_bricks.png" },
      { x: 0, y: 0, z: -1, id: "minecraft:polished_blackstone_bricks", name: "Чернитное основание", color: 0x18181b, icon: "assets/recipes_icons/polished_blackstone_bricks.png" },
      { x: 0, y: 0, z: 1, id: "minecraft:polished_blackstone_bricks", name: "Чернитное основание", color: 0x18181b, icon: "assets/recipes_icons/polished_blackstone_bricks.png" },
      { x: -2, y: 1, z: -2, id: "minecraft:netherrack", name: "Чаша пламени (СЗ)", color: 0xef4444, icon: "assets/recipes_icons/campfire.png" },
      { x: 2, y: 1, z: -2, id: "minecraft:netherrack", name: "Чаша пламени (СВ)", color: 0xef4444, icon: "assets/recipes_icons/campfire.png" },
      { x: -2, y: 1, z: 2, id: "minecraft:netherrack", name: "Чаша пламени (ЮЗ)", color: 0xef4444, icon: "assets/recipes_icons/campfire.png" },
      { x: 2, y: 1, z: 2, id: "minecraft:netherrack", name: "Чаша пламени (ЮВ)", color: 0xef4444, icon: "assets/recipes_icons/campfire.png" },
      { x: 0, y: 1, z: 0, id: "cataclysm:altar_of_fire", name: "Алтарь Огня (Центр)", color: 0xf97316, icon: "assets/recipes_icons/altar_of_fire.png" }
    ]
  },
  {
    id: "create_crushing_pair",
    name: "Дробильный Узел (Create Crushing Pair)",
    mod: "Create",
    category: "create",
    dimensions: "2 × 3 × 1",
    icon: "assets/recipes_icons/crushing_wheel.png",
    subtitle: "Промышленный блок измельчения",
    description: "Два Дробящих колеса Create, установленные вплотную с противоположным направлением вращения. Сверху засыпается руда или булыжник, снизу высыпается измельчённая пыль.",
    guide: "1. Установите два Дробящих колеса (Crushing Wheels) на валах вплотную друг к другу.\n2. Настройте кинетическую передачу через шестерни так, чтобы колёса вращались навстречу друг другу внутрь.\n3. Сверху установите загрузочную воронку (Chute), снизу — сборный конвейер или желоб.\n4. Забрасывайте руду для удвоения выхода ресурсов!",
    command: "/give @p create:crushing_wheel 2",
    materials: [
      { id: "create:crushing_wheel", name: "Дробящее колесо", icon: "assets/recipes_icons/crushing_wheel.png", count: 2 },
      { id: "create:chute", name: "Желоб загрузки (Chute)", icon: "assets/recipes_icons/chute.png", count: 1 },
      { id: "create:gearbox", name: "Редуктор встречного вращения", icon: "assets/recipes_icons/gearbox.png", count: 1 }
    ],
    blocks: [
      { x: 0, y: 0, z: 0, id: "create:chute", name: "Нижний приемный желоб", color: 0x52525b, icon: "assets/recipes_icons/chute.png" },
      { x: -1, y: 1, z: 0, id: "create:crushing_wheel", name: "Левое дробящее колесо (⟳)", color: 0x71717a, icon: "assets/recipes_icons/crushing_wheel.png" },
      { x: 0, y: 1, z: 0, id: "create:crushing_wheel", name: "Правое дробящее колесо (⟲)", color: 0x71717a, icon: "assets/recipes_icons/crushing_wheel.png" },
      { x: -1, y: 1, z: -1, id: "create:shaft", name: "Вал привода", color: 0x3f3f46, icon: "assets/recipes_icons/shaft.png" },
      { x: 0, y: 1, z: -1, id: "create:gearbox", name: "Редуктор обратного хода", color: 0xa16207, icon: "assets/recipes_icons/gearbox.png" },
      { x: 0, y: 2, z: 0, id: "create:chute", name: "Верхняя воронка загрузки", color: 0x52525b, icon: "assets/recipes_icons/chute.png" }
    ]
  },
  {
    id: "eternal_portal",
    name: "Вечный Портал Края (Eternal Portal)",
    mod: "BetterEnd",
    category: "portals",
    dimensions: "7 × 2 × 7",
    icon: "assets/recipes_icons/eternal_pedestal.png",
    subtitle: "Древние врата возвращения",
    description: "Древний монумент из рунического флаволита с 6 Вечными пьедесталами. При активации 6 кристаллами открывает путь сквозь измерения.",
    guide: "1. Постройте кольцо из Рунического флаволита диаметром 7 блоков.\n2. Установите 6 Вечных пьедесталов (Eternal Pedestals) по кругу.\n3. Вставьте в каждый пьедестал по Вечному кристаллу (Eternal Crystal) соответствующего оттенка.\n4. В центре портала распахнётся космический вихрь возвращения в Верхний мир!",
    command: "/give @p betterend:eternal_pedestal 6",
    materials: [
      { id: "betterend:runed_flavolite", name: "Рунический флаволит", icon: "assets/recipes_icons/runed_flavolite.png", count: 24 },
      { id: "betterend:eternal_pedestal", name: "Вечный пьедестал", icon: "assets/recipes_icons/eternal_pedestal.png", count: 6 },
      { id: "betterend:eternal_crystal", name: "Вечный кристалл", icon: "assets/recipes_icons/eternal_crystal.png", count: 6 }
    ],
    blocks: (function() {
      const b = [];
      // 7x7 outer circle of flavolite
      const R = 3;
      for (let x = -R; x <= R; x++) {
        for (let z = -R; z <= R; z++) {
          const d = Math.round(Math.sqrt(x*x + z*z));
          if (d === R) {
            b.push({ x, y: 0, z, id: "betterend:runed_flavolite", name: "Рунический флаволит", color: 0xd97706, icon: "assets/recipes_icons/runed_flavolite.png" });
          } else if (d < R) {
            b.push({ x, y: 0, z, id: "betterend:flavolite_tiles", name: "Плитка флаволита", color: 0x9ca3af, icon: "assets/recipes_icons/flavolite_tiles.png" });
          }
        }
      }
      // 6 Pedestals at radius 2
      const angles = [0, 60, 120, 180, 240, 300];
      angles.forEach((deg, idx) => {
        const rad = deg * Math.PI / 180;
        const px = Math.round(2 * Math.cos(rad));
        const pz = Math.round(2 * Math.sin(rad));
        b.push({ x: px, y: 1, z: pz, id: "betterend:eternal_pedestal", name: `Вечный пьедестал [${idx+1}/6]`, color: 0x38bdf8, icon: "assets/recipes_icons/eternal_pedestal.png" });
      });
      // Center portal beam
      b.push({ x: 0, y: 1, z: 0, id: "betterend:end_portal", name: "Пространственный разлом", color: 0xc084fc, icon: "assets/recipes_icons/eternal_pedestal.png" });
      return b;
    })()
  },
  {
    id: "malum_weeping_well",
    name: "Колодец Плача (Weeping Well)",
    mod: "Malum",
    category: "altars",
    dimensions: "3 × 3 × 3",
    icon: "assets/recipes_icons/weeping_well.png",
    subtitle: "Бездна трансмутации предметов",
    description: "Многоблочный колодец из плачущего камня (Weeping Rock), в недрах которого клокочет чистая материя Пустоты. Предметы, сброшенные в колодец, трансмутируются силой Бездны.",
    guide: "1. Выкопайте яму 3×3 глубиной 2 блока.\n2. Облицуйте дно и стенки Плачущим камнем (Weeping Rock).\n3. В центр установите сердце Колодца Плача (Weeping Well).\n4. Заполните колодец сущностью пустоты и сбрасывайте предметы (Q) для трансмутации!",
    command: "/give @p malum:weeping_well 1",
    materials: [
      { id: "malum:weeping_well", name: "Колодец Плача (Ядро)", icon: "assets/recipes_icons/weeping_well.png", count: 1 },
      { id: "malum:weeping_rock", name: "Плачущий камень (Weeping Rock)", icon: "assets/recipes_icons/weeping_rock.png", count: 16 }
    ],
    blocks: (function() {
      const b = [];
      // Basin 3x3 at y=0
      for (let x = -1; x <= 1; x++) {
        for (let z = -1; z <= 1; z++) {
          if (x === 0 && z === 0) {
            b.push({ x, y: 0, z, id: "malum:weeping_well", name: "Сердце Колодца Плача", color: 0x581c87, icon: "assets/recipes_icons/weeping_well.png" });
          } else {
            b.push({ x, y: 0, z, id: "malum:weeping_rock", name: "Плачущий камень (Дно)", color: 0x2e1065, icon: "assets/recipes_icons/weeping_rock.png" });
          }
        }
      }
      // Ring 3x3 at y=1 (walls)
      for (let x = -1; x <= 1; x++) {
        for (let z = -1; z <= 1; z++) {
          if (x === 0 && z === 0) {
            b.push({ x, y: 1, z, id: "malum:void_fluid", name: "Субстанция Пустоты", color: 0x3b0764, icon: "assets/recipes_icons/weeping_well.png" });
          } else {
            b.push({ x, y: 1, z, id: "malum:weeping_rock", name: "Плачущий камень (Стенка)", color: 0x2e1065, icon: "assets/recipes_icons/weeping_rock.png" });
          }
        }
      }
      return b;
    })()
  }
];
