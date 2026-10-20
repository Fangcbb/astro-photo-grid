import { admin } from "./directus-admin.mjs";

function field(name, type, options = {}) {
  const { meta = {}, schema = {} } = options;
  return {
    field: name,
    type,
    meta: { interface: "input", ...meta },
    schema: { is_nullable: true, ...schema },
  };
}
const status = field("status", "string", {
  schema: { default_value: "draft", is_nullable: false },
  meta: {
    interface: "select-dropdown",
    options: {
      choices: [
        { text: "草稿", value: "draft" },
        { text: "已发布", value: "published" },
      ],
    },
    required: true,
  },
});
const definitions = [
  {
    collection: "albums",
    schema: {},
    meta: {
      icon: "photo_library",
      note: "摄影系列；先创建相册，再上传作品。",
      display_template: "{{title}}",
      sort_field: "sort",
    },
    fields: [
      field("id", "uuid", {
        meta: { hidden: true, special: ["uuid"] },
        schema: { is_primary_key: true, is_nullable: false },
      }),
      status,
      field("sort", "integer", {
        meta: { hidden: true },
        schema: { default_value: 0 },
      }),
      field("title", "string", {
        schema: { is_nullable: false },
        meta: { required: true, note: "相册标题" },
      }),
      field("slug", "string", {
        schema: { is_unique: true, is_nullable: false },
        meta: {
          required: true,
          note: "网址标识，只能使用小写英文、数字和连字符，例如 landscapes",
        },
      }),
      field("description", "text", { meta: { interface: "input-multiline" } }),
    ],
  },
  {
    collection: "photos",
    schema: {},
    meta: {
      icon: "photo_camera",
      note: "只发布有标题、画面描述、图片和已发布相册的作品。",
      display_template: "{{title}}",
      sort_field: "sort",
    },
    fields: [
      field("id", "uuid", {
        meta: { hidden: true, special: ["uuid"] },
        schema: { is_primary_key: true, is_nullable: false },
      }),
      status,
      field("sort", "integer", {
        meta: { hidden: true },
        schema: { default_value: 0 },
      }),
      field("title", "string", {
        schema: { is_nullable: false },
        meta: { required: true },
      }),
      field("slug", "string", {
        schema: { is_unique: true, is_nullable: false },
        meta: {
          required: true,
          note: "网址标识，例如 morning-light；发布后修改会改变作品链接",
        },
      }),
      field("alt", "string", {
        schema: { is_nullable: false },
        meta: {
          required: true,
          note: "描述照片画面，供屏幕阅读器和搜索引擎使用",
        },
      }),
      field("description", "text", { meta: { interface: "input-multiline" } }),
      field("location", "string"),
      field("taken_at", "date", {
        meta: { interface: "datetime", note: "可选拍摄日期" },
      }),
      field("album", "uuid", {
        schema: { is_nullable: false },
        meta: {
          interface: "select-dropdown-m2o",
          special: ["m2o"],
          required: true,
          options: { template: "{{title}}" },
        },
      }),
      field("file", "uuid", {
        schema: { is_nullable: false },
        meta: { interface: "file-image", special: ["file"], required: true },
      }),
    ],
  },
];
const existing = new Set(
  (await admin("/collections")).map((c) => c.collection),
);
for (const definition of definitions) {
  if (existing.has(definition.collection)) {
    const fields = new Map(
      (await admin(`/fields/${definition.collection}`)).map((f) => [
        f.field,
        f,
      ]),
    );
    for (const expected of definition.fields) {
      if (fields.get(expected.field)?.type !== expected.type)
        throw new Error(
          `Existing ${definition.collection}.${expected.field} is missing or incompatible; review schema manually`,
        );
    }
    console.log(
      `Verified existing ${definition.collection}; preserved its configuration.`,
    );
  } else {
    await admin("/collections", "POST", definition);
    console.log(`Created ${definition.collection}`);
  }
}
const relations = await admin("/relations");
for (const [fieldName, target] of [
  ["album", "albums"],
  ["file", "directus_files"],
]) {
  const existingRelation = relations.find(
    (r) => r.collection === "photos" && r.field === fieldName,
  );
  if (existingRelation && existingRelation.related_collection !== target)
    throw new Error(`Incompatible relation photos.${fieldName}`);
  if (!existingRelation)
    await admin("/relations", "POST", {
      collection: "photos",
      field: fieldName,
      related_collection: target,
      schema: { on_delete: "RESTRICT" },
      meta: { one_field: null },
    });
}
console.log(
  "CMS schema ready. Public access remains disabled. Create albums and photos in the Directus Data Studio.",
);
