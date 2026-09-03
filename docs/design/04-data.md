# 履修登録支援AIチャットボット 設計書(v0.9.2)— §5 データ設計

> 本ファイルは [`docs/design.md`](../design.md) の一部である。§番号は設計書全体で通し番号であり、他ファイルの節を `§X.Y` の形で参照する。全ファイルの対応表は [design.md](../design.md) の「0.3 本書の構成」を参照。

---

## 5. データ設計

### 5.1 履修要項データのスキーマ

実データの構造を以下に定義する。backend の Pydantic モデル(§4.4.3)はこの定義に従って実装する。「任意」と記したフィールドは省略または null があり得るため、`Optional` として定義する。

#### 5.1.1 ファイル種別

| 種別 | 配置 | 内容 | 新しく作り直す条件 |
|---|---|---|---|
| 課程ファイル | `curricula/admission-<年度>/<課程コード>-<課程名>.yaml` | 専攻科目・フリーゾーンの要件枠、専攻科目の設置科目一覧、課程固有の規定 | 入学年度ごとに作る |
| 教養教育科目ファイル | `curricula/admission-<年度>/00-liberal-arts.yaml` | 教養教育科目の要件枠(`liberal.*`)と設置科目一覧(その入学年度の全課程共通) | 入学年度ごとに作る。内容が他コホートと同一なら複製し `duplicate_of` を付す |
| 開講年度ファイル | `offerings/<開講年度>/admission-<入学年度>/` | 科目名 → シラバスコードの対応 | 毎年度 |

課程ファイルと教養教育科目ファイルは**シラバスコードを持たない**。開講年度ファイルとは**科目名**で結合する(§4.4.1)。

卒業要件の枠(`requirement_slots`)は課程ファイルと教養教育科目ファイルに分かれて定義され、**同じ `key` を二重に定義しない**。合計単位数の検算と `overflow_to` の解決は、両者をマージしたあとのオブジェクトに対して行う(§4.4.3)。

#### 5.1.2 課程ファイル

```yaml
program:
  code: "01"                        # 課程コード2桁(§4.4.2)。課程の一次識別子
  name: "数理・情報科学課程"
  name_aliases: []                  # 任意。改称前後の名称・履修要項側の表記ゆれ
admission_year: 2024                # この課程ファイルが属するコホート。ディレクトリ名と一致させる
curriculum_version: "2020年度以降入学生"   # 任意。履修要項の見出しの版表記をそのまま記録する(§4.4.1)
duplicate_of: null                  # 任意。他コホートのファイルの複製である場合、その curricula/ 起点パス(§5.1.5)

graduation:
  total_credits: 124                # 卒業所要総単位数
  excluded_types: ["随意"]          # 卒業要件単位に算入しない type
  notes: "..."                      # 任意。卒業要件の補足

requirement_slots:                  # 専攻科目・フリーゾーンの要件枠。liberal.* は持たない(以下は抜粋)
  - key: "basic.required"           # マージ後に一意
    credits: 9
    accepts: {category: "専門基礎科目", type: "必修"}
  - key: "basic.elective"
    credits: 0
    accepts: {category: "専門基礎科目", type: ["選択必修", "選択"]}
    overflow_to: "free.faculty"               # 履修要項 注記B
    notes: "..."                              # 任意
  - key: "applied.required_elective"
    credits: 22
    accepts: {category: "専門応用科目", type: "選択必修"}
    overflow_to: "applied.elective"           # 注記C
  - key: "related"
    credits: 0
    accepts: {category: "専門関連科目"}       # 他課程ファイルから導出される(§4.4.3)
    overflow_to: "free.faculty"               # 注記D
  - key: "free.faculty"
    credits: 6
    accepts: {category: ["専門基礎科目", "専門応用科目", "専門関連科目"]}   # 注記E 教養教育科目は不可
    overflow_to: "free.all"
  - key: "free.all"
    credits: 10
    accepts: {category: "any"}                # 注記F 区分を問わない

tracks:                             # 任意。課程内コース区分(存在する課程のみ)
  - key: "math"                     # ファイル内で一意
    name: "数学系コース"
    constraints:                    # 履修要項の「コース毎の履修要件」別表から転記する
      - {slot: "<requirement_slots の key>", track_group: "<科目群名>", pool: 0, min: 0}
  - key: "sogo"
    name: "総合コース"
    constraints: []                 # 内訳の下限を持たないコースは空リスト。別表の空欄セルはこの形で表す

prerequisites:                      # 任意。先修要件(専攻科目)
  - course_title: "..."
    grade: 3                        # 配当年次
    term: "前期"                    # 任意
    quarters: ["1Q"]                # 任意
    conditions: "卒業要件総修得単位数52単位以上"
grade_up_requirements:              # 任意。進級要件
  - to_grade: 4
    conditions: null                # 条件なしは null
    notes: "..."                    # 任意

registration_limits:                # 履修登録制限単位数(CAP制)
  by_semester:
    - semesters: [1, 2, 3, 4]       # 対象セメスター(通算)
      max_credits_per_semester: 22  # 学期あたり上限
    - semesters: [7, 8]
      max_credits_per_year: 48      # 年間上限。per_semester とはどちらか一方のみを持つ
      notes: "..."                  # 任意
  notes: |                          # 任意。通年・クォーター科目の算入規則、CAP 対象外科目など
    ...
  gpa_exception: "..."              # 任意。GPA による制限緩和の規定

credit_caps:                        # 任意。課程固有の算入上限(以下は応用化学課程の例。§5.1.5)
  - titles: ["キャリア実習Ⅰ", "キャリア実習Ⅱ"]
    max_credits: 4
    overflow_to: null
    notes: "インターンシップ系の卒業要件算入上限は4単位(他課程は2単位)"

courses:                            # 専攻科目のみ。教養教育科目は 00-liberal-arts.yaml が持つ
  - title: "微積分及び演習Ⅱ"        # 科目名(マージ後も一意)
    category: "専門応用科目"        # 専門基礎科目 / 専門応用科目
    type: "選択必修"                # 必修 / 選択必修 / 選択 / 随意
    track_groups: ["数学系"]        # 任意。tracks[].constraints が参照する科目群。通常1要素
    credits: 3
    grade: 1                        # 配当年次(§5.1.5)
    term: "後期"                    # 前期 / 後期 / 通年 / サ集
    quarters: ["3Q", "4Q"]          # §5.1.5
    notes: "..."                    # 任意
```

例示中の具体値は構造を示すためのものであり、**転記時は履修要項および別表を正とする**。とりわけ `tracks[].constraints` の `pool` / `min` は履修要項の「コース毎の履修要件」別表からそのまま転記すること。

`category` / `type` / `track_groups` は**直交する3軸**として扱う。旧スキーマの `subcategory: "選択(数学系)"` のように `type` と `track_group` を1つの文字列に畳み込むと、コース要件の判定に文字列解析が必要になるため分離する。`track_groups` を配列にしているのは、1科目が複数の科目群から履修可能な場合(別表で複数行に現れる科目)を表現するためで、通常は1要素である。

数理・情報科学課程(2024年度入学)は、教養教育科目ファイル由来の6枠と課程ファイルの8枠を合わせて以下の14枠となる。合計単位数の検算はこのマージ後の一覧に対して行う(§4.4.3)。

| key | 単位 | `overflow_to` | 定義元 |
|---|---:|---|---|
| `liberal.buddhism` | 4 | — | 教養 |
| `liberal.language.required` | 6 | `liberal.elective` | 教養 |
| `liberal.general.humanities` | 2 | `liberal.elective` | 教養 |
| `liberal.general.social` | 2 | `liberal.elective` | 教養 |
| `liberal.general.sports` | 2 | — | 教養 |
| `liberal.elective` | 12 | `free.all` | 教養 |
| `basic.required` | 9 | — | 課程 |
| `basic.elective` | 0 | `free.faculty` | 課程 |
| `applied.required` | 18 | — | 課程 |
| `applied.required_elective` | 22 | `applied.elective` | 課程 |
| `applied.elective` | 31 | `free.faculty` | 課程 |
| `related` | 0 | `free.faculty` | 課程 |
| `free.faculty` | 6 | `free.all` | 課程 |
| `free.all` | 10 | — | 課程 |
| **合計** | **124** | | |

`credits: 0` は「卒業要件としての枠を持たず、修得単位は `overflow_to` 先に計上される」ことを表す(専門基礎科目の選択・専門関連科目が該当。履修要項 注記B・注記D)。

#### 5.1.3 教養教育科目ファイル

```yaml
admission_year: 2024                # このファイルが属するコホート。ディレクトリ名と一致させる
liberal_arts_version: "until-2025"  # 履修要項の版。until-2025(先端理工学部【〜2025年度入学】) / 2026(【2026年度入学〜】)
applies_to: ["先端理工学部"]
duplicate_of: null                  # 任意。他コホートのファイルの複製である場合、その curricula/ 起点パス
                                    # 例: admission-2025/00-liberal-arts.yaml には
                                    #     duplicate_of: "admission-2024/00-liberal-arts.yaml"

requirement_slots:                  # liberal.* スロットの唯一の定義元。課程ファイルは持たない
  - key: "liberal.buddhism"
    credits: 4
    accepts: {subcategory: "「仏教の思想」科目", type: "必修"}
  - key: "liberal.language.required"
    credits: 6
    accepts: {subcategory: "必修外国語科目"}
    overflow_to: "liberal.elective"           # 履修要項 注記A
  - key: "liberal.general.humanities"
    credits: 2
    accepts: {subcategory: "人文科学系科目", kikan: true}
    overflow_to: "liberal.elective"
  - key: "liberal.general.social"
    credits: 2
    accepts: {subcategory: "社会科学系科目", kikan: true}
    overflow_to: "liberal.elective"
  - key: "liberal.general.sports"
    credits: 2
    accepts: {subcategory: "スポーツ科学系科目", type: "必修"}
  - key: "liberal.elective"
    credits: 12
    accepts: {category: "教養教育科目"}       # 上位枠に収まらない教養教育科目の受け皿
    overflow_to: "free.all"

credit_caps:                        # 卒業要件への算入上限(超過分はフリーゾーンにも計上されない)
  - titles: ["教養教育科目特別講義"]
    max_credits: 2
    overflow_to: null               # null＝どこにも計上されない(履修要項 設置科目 注5・注10)

courses:
  - title: "仏教の思想A"
    category: "教養教育科目"
    subcategory: "「仏教の思想」科目"    # §5.1.5
    type: "必修"
    credits: 2
    grade: 1
    term: "前期"
    quarters: ["1Q", "2Q"]
  - title: "哲学入門"
    category: "教養教育科目"
    subcategory: "人文科学系科目"
    type: "選択必修"
    kikan: true                     # 基幹科目(設置科目表の●印)。§5.1.5
    credits: 2
    grade: 1
  - title: "ドイツ語ⅠA"
    category: "教養教育科目"
    subcategory: "選択外国語科目"
    type: "選択"
    credits: 1
    grade: 1
    prerequisite_of: "ドイツ語ⅡA"   # 任意。教養側の先修制は選択外国語のみ
  - title: "生活の中の化学"
    category: "教養教育科目"
    subcategory: "自然科学系科目"
    type: "選択"
    credits: 2
    grade: 1
    not_available_to_programs: ["05"]   # 任意。この課程コードでは履修不可(設置科目表 備考。§5.1.5)
  - title: "教養教育科目特別講義"
    category: "教養教育科目"
    subcategory: "教養特別講義科目"  # 上位枠を持たず liberal.elective に計上される
    type: "選択"
    credits: 2
    grade: 1
```

`requirement_slots` の `accepts` は履修要項「教養教育科目の教育目的及び履修方法」の記述を機械可読にしたものであり、**内容の確定はアドバイザー教員の監修による**(§5.1 末尾)。

上の例は `liberal_arts_version: "until-2025"`(2024・2025年度入学)のものである。**2026年度入学版は別カリキュラムであり、次の点が異なる。**

- **科目群の軸が新設された。** 基礎教養(スタートアップ科目群 / ベーシック教養科目群 / 全学共通教育科目群)と発展教養(アドバンスト教養科目群 / 教養教育ゼミナール科目群 / アクティブ・ラーニング科目群 / 融合型科目群 / 学部等提供科目群)の2階層で、従来の分野別区分(`subcategory`)とは直交する。`course_group` と `subgroup` を追加して表現する(§5.1.5)
- **設置科目が約150件から約270件に増えた。** 選択外国語にスペイン語、「仏教の思想」の選択科目に「仏教の世界」「真宗教団史」が加わっている。`subcategory` の8値と `credit_caps`(「教養教育科目特別講義」は1科目2単位まで)は変わらない
- **履修不可の指定が課程単位から学部単位に変わった。** 「生活の中の化学」の応用化学課程履修不可の注記は2026年度入学版の設置科目表には存在しないため、このコホートのファイルに `not_available_to_programs` は現れない。代わりに【農学部履修不可】【先端理工学部履修不可】の指定があり、**【先端理工学部履修不可】の科目は転記しない**(このファイルは先端理工学部のためのものであるため)
- **卒業要件枠は変わっていない。** 卒業要件単位数表は2024・2025・2026年度版で同一(仏教4 / 言語6 / スポーツ2 / 人文2 / 社会2 / 選択12 = 28単位、総計124単位)であり、`requirement_slots` はそのまま使える

#### 5.1.4 開講年度ファイル

```yaml
offering_year: 2026
admission_year: 2024                # 対応する curricula/admission-<年度>/ のコホート
program_code: "01"                  # 対応する課程ファイルの program.code。教養教育科目対応版は "00"
resolved:                           # 名寄せ成功かつ当年度開講。キーは科目名、値はシラバスコード(1:N)
  微積分及び演習Ⅱ: ["Y001006010"]
  仏教の思想A: ["G260110004", "G260110005", "G260110017"]
not_offered:                        # 当年度不開講と確認できた科目
  - {title: "機械学習Ⅰ", reason: "2026年度不開講(履修要項の開講年度表記)"}
unresolved: []                      # どちらとも確定できなかった科目
  # - {title: "...", reason: "api-clean に一致候補なし"}
```

ファイルは `offerings/<開講年度>/admission-<入学年度>/` に、対応する `curricula/` 側と同名で置く(§4.4.2)。入学年度ごとに設置科目一覧が異なるため、1つの開講年度に対してコホート数ぶんのファイルが生成される。内容は `curricula/` の科目名一覧と api-clean の当該開講年度データから、生成スクリプト(`backend/scripts/build_offerings.py`、§4.2.1)で作成する。振り分けは次の基準による。

1. 正規化(§5.1.5)後の科目名が api-clean の当該開講年度に一致する → `resolved`
2. 一致しないが、当年度不開講であることを履修要項または教務課の情報で確認できた → `not_offered`(根拠を `reason` に書く)
3. どちらとも確定できない → `unresolved`(調査状況を `reason` に書く)

**`unresolved` は「まだ判断がついていないもの」であり、`not_offered` の受け皿ではない。** 根拠を書けないものを `not_offered` に入れてはならない。この区別が崩れると、名寄せの取りこぼしが「不開講」として恒久的に隠れる。

`resolved` のキー、および `not_offered` / `unresolved` の `title` は、対応する `curricula/` 側の `title` と**1文字も違わない原表記**を用いる。正規化は名寄せ処理の内部にとどめ、このファイルには持ち込まない(§5.1.5)。こうすることで `curricula` との突合が単純な文字列一致になる。

`resolved` / `not_offered` / `unresolved` の3分割により、**「不開講」と「名寄せ失敗」を区別する**。前者は正常な状態(履修要項に載っているが今年度は開かれない科目)、後者はデータ不整合であり検出されなければならない。単に「コードが無い」とだけ表現すると両者が混ざる。ただし `unresolved` の検出は CI(§12.2)でマージをブロックする形で行い、backend の起動は妨げない(§4.4.3)。

**シラバスコードの年度不変性は、専攻科目についてのみ検証済みである。**

- 専攻科目(`Y...`): api-clean に2025・2026両年度のデータが存在し、両年度で照合した結果、**コード先頭7桁が科目の恒久 ID として機能する**ことを確認した(数理・情報科学課程の282科目で7桁プレフィックスの衝突ゼロ。科目名で突合して年度間一致62件・差分3件、差分はいずれも下3桁のクラス枝番のみ)。先頭4桁は主開講課程を表す(`Y001`=数理・情報科学、`Y002`=知能情報メディア、`Y003`=電子情報通信、`Y004`=機械工学・ロボティクス、`Y005`=応用化学、`Y006`=環境科学、`Y000`=学部共通)
- 教養教育科目(`G...`): **api-clean には2026年度分の613件のみが登録されており、2025年度分は0件である。** したがって年度間比較ができず、コードが年度不変かを検証できていない。`G26...` の `26` が開講年度を表す可能性があるが未確認(§13)

検証できていないことは§4.4.1のファイル分割方針を変えない。コードが年度不変であったとしても `offerings/` を年度ごとに置くこと自体は無害であり、不変でなかった場合に初めて必要になる構造だからである。分割しておけば、教養教育科目の年度不変性がどちらに転んでも設計を変えずに済む。

#### 5.1.5 フィールドの規約

- **`grade`(配当年次)** は「この年次**から**履修可能」を意味する。特定年次に限る等の例外は `notes` に記す。
- **`type`** は {必修, 選択必修, 選択, 随意} の4値。`随意` は卒業要件単位に算入されない(多くは CAP 対象外。詳細は各科目の `notes` に従う)。
- **`term`** は {前期, 後期, 通年, サ集} の4値。`サ集` はサマーセッション集中開講(履修登録制限単位数の対象外。§5.1.2 `registration_limits.notes`)を表す。
- **`term` と `quarters`** は整合する: `前期` ⇔ `quarters ⊆ {1Q, 2Q}`、`後期` ⇔ `quarters ⊆ {3Q, 4Q}`、`通年` ⇔ `quarters` を持たない、`サ集` ⇔ `quarters` を持たない。設置科目一覧画像では、単一クォーター科目はセル中央・セメスター科目は2クォーター境界上・通年科目は前期|後期境界上のマークで表される。
- **`credits`** は全科目必須とする。
- **`category`** は `教養教育科目` / `専門基礎科目` / `専門応用科目` / `専門関連科目` の4値。ただし `専門関連科目` は転記せず、ロード時に他課程ファイルから導出した科目に付与される値であり、YAML に直接書くことはない(§4.4.1)。
- **`subcategory`(教養教育科目)** は次の8値。履修要項の公式区分は「「仏教の思想」科目 / 言語科目 / 教養科目」の3区分で、人文科学系〜スポーツ科学系は「教養科目」の下位にあたるが、**「教養科目全体で○単位」という要件が履修要項に存在しない**ため中間層は設けずフラットに保持する。専攻科目は `subcategory` を持たない。
  - `「仏教の思想」科目` / `必修外国語科目` / `選択外国語科目` / `人文科学系科目` / `社会科学系科目` / `自然科学系科目` / `スポーツ科学系科目` / `教養特別講義科目`
  - 旧スキーマの `言語科目` は `必修外国語科目`(英語総合6単位) と `選択外国語科目`(独・仏・中・コリア語ほか)に分割する。分割の理由は2つあり、(1) 教養教育科目で先修制が設定されるのは選択外国語のみ、(2) 英語6単位の超過分が教養選択に計上される規定は必修外国語にのみ適用される。1値のままではどちらも表現できない。
  - `教養特別講義科目`(「教養教育科目特別講義」)は専用の要件枠を持たず `liberal.elective` に計上されるが、`credit_caps` による算入上限が課される唯一の区分であるため、独立した値として保持する。
- **`accepts`(`requirement_slots[].accepts`)** は「このスロットが受け入れる科目の条件」を表す。記法は次のとおり。
  - キーは `category` / `subcategory` / `type` / `kikan` のいずれか。**複数キーは AND** で結合する。
  - 値が配列のときは**その中のいずれかに一致(OR)**を意味する(例: `type: ["選択必修", "選択"]`)。
  - `category: "any"` は区分を問わないことを表す予約値(オールフリーゾーン)。`any` という名前の区分は存在しない。
  - どのスロットにも受け入れられない科目が生じないよう、区分ごとに必ず受け皿となるスロットを用意する。
- **`tracks[].constraints`** は履修要項の「コース毎の履修要件」別表の1セルに対応する。`slot` はどの要件枠の中での話かを、`track_group` はどの科目群かを指し、`pool` はその科目群に設置されている単位数(別表の母数)、`min` はコース選択者が最低限修得すべき単位数を表す。別表で下限が示されていないセルは制約を書かない(そのコースの `constraints` が空リストになることもある)。`pool` は原理的には `courses` から算出できるが、別表の母数と設置科目一覧の齟齬を検出するために別表の値をそのまま転記する。
- **`credit_caps`** は特定科目群の卒業要件算入上限を表し、教養教育科目ファイルと課程ファイルの双方が持てる。`max_credits` を超えた分は `overflow_to` 先に計上し、`overflow_to: null` のときはどこにも計上しない。`requirement_slots[].overflow_to` の省略(＝上位スロットへ流れない)とは意味が異なる。
- **`not_available_to_programs`** は教養教育科目ファイルの `courses[]` に付す任意フィールドで、その科目を履修できない課程のコードを列挙する(例: `["05"]`)。マージ時に該当課程の `courses` から**除外**し、以後どのスロットの判定にも用いない(§4.4.3)。課程ファイル側の上書き(旧 `liberal_arts_exceptions`)ではなく教養教育科目ファイルに置くのは、この情報の出典が教養教育科目の設置科目表の備考欄だからである。存在しない課程コードを書いた場合は起動時バリデーションエラーとする。
- **`course_group` / `subgroup`** は2026年度入学版の教養教育科目ファイルでのみ用いる(§5.1.3)。`course_group` は `基礎教養` / `発展教養` の2値、`subgroup` は `スタートアップ科目群` / `ベーシック教養科目群` / `全学共通教育科目群` / `アドバンスト教養科目群` / `教養教育ゼミナール科目群` / `アクティブ・ラーニング科目群` / `融合型科目群` / `学部等提供科目群` の8値。分野別区分である `subcategory` とは直交する軸であり、どちらか一方に畳み込まない。卒業要件の判定に使うのは `subcategory` 側であり、`course_group` / `subgroup` は履修時期の目安と科目の位置づけを保持するために持つ。
- **`curriculum_version` / `liberal_arts_version`** は履修要項側の版表記を記録するだけのフィールドであり、**ファイルの同一性の根拠には使わない**(§4.4.1)。同一性は `duplicate_of` の宣言によってのみ表明する。
- **`duplicate_of`** は「このファイルは別コホートの同名ファイルの完全な複製である」という宣言で、値は `curricula/` を起点とした複製元のパス。CI は宣言があるファイルについてのみ複製元との内容一致を検査する(§12.2)。宣言のないファイルどうしが偶然一致していても検査対象にはしない。
- **`kikan`(基幹科目)** は設置科目表の●印に対応する真偽値(省略時は false)。人文科学系・社会科学系の選択必修は「基幹科目に指定された科目から各1科目(2単位)以上」であり、`subcategory` だけでは選択必修か否かが決まらない。現行の履修要項では `type: 選択必修` と外延が一致するが、**基幹科目の指定は年度改訂で変わり得る**ため独立フィールドとする(`type` に畳み込むと、指定変更が「科目の性質の変化」と区別できなくなる)。両者は独立に持ちつつ、`kikan: true` ならば `type: "選択必修"` であることを起動時バリデーションで強制する(§4.4.3)。判定に用いるのは `accepts` が参照する側のフィールドであり、両者が食い違う YAML はバリデーションで弾かれるため、優先順位を定める必要はない。
- **`requirement_slots[].overflow_to`** は履修要項の余剰計上規定(注記A〜F)を表す。カスケードは `教養選択必修 → 教養選択 → オールフリー` / `専門応用選択必修 → 専門応用選択 → 学部フリー` / `専門基礎選択・専門関連 → 学部フリー → オールフリー` の3系統。学部フリーゾーンは専攻科目のみを受け入れ、教養教育科目は受け入れない(注記E)。カスケードは教養教育科目ファイルと課程ファイルをまたぐ(`liberal.elective → free.all`)ため、参照解決と循環検査はマージ後に行う(§4.4.3)。
- **`requirement_slots[].credits` の合計は `total_credits` と一致する。** 旧スキーマの `categories` は大区分(小計)と下位区分を併記していたため合計が一致せず、機械的な検算ができなかった。スロット表現ではこれが起動時バリデーションで検証できる。検算の対象は教養教育科目ファイルとマージしたあとの全スロットであり、課程ファイル単体ではない。
- **科目名の表記** は履修要項の設置科目表を正とし、**正規化せずそのまま転記する**。ただし api-clean との名寄せ時には、全角英数字→半角、空白除去、Unicode NFKC 正規化を施したうえで突合する(履修要項側に「英語総合３」「英語セミナーA 1」のような全角数字・空白混じりの表記があるため)。正規化は名寄せ処理側の責務とし、YAML には持ち込まない。

なお、**開講曜日・時限・教室・担当者などの開講属性は履修要項 YAML では保持しない**。これらは既存シラバスバックエンドの `syllabus` テーブル(`day_of_week` / `period` / `room` カラム)が保持しており、api-clean(`GET /syllabi`、`GET /syllabi/{code}`)経由で参照する。YAML 側に持たせると二重管理になるため、YAML は卒業要件・科目区分(課程固有の情報)のみを担う。

スキーマの最終確定はアドバイザー教員監修のもと、要件§8に従って行う。

### 5.2 クライアント側状態スキーマ

#### 5.2.1 学生プロファイル(Zustand `student.ts`)

```typescript
type Course = {
  code?: string          // 任意(成績表に明記されていれば)
  title: string          // 科目名
  year: number           // 履修年度
  term: "前期" | "後期" | "通年" | "1Q" | "2Q" | "3Q" | "4Q" | "サ集"
  credits: number
  status: "passed" | "failed" | "withdrawn"
  rawScore?: string      // 元の表記(数値または記号)
}

type StudentProfile = {
  grade: 1 | 2 | 3 | 4 | null
  program: string | null
  completedCourses: Course[]
}
```

#### 5.2.2 対話履歴(Zustand `chat.ts`)

```typescript
type Message = {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: number
}

type ChatState = {
  proposalMessages: Message[]
  syllabusMessages: Message[]
  syllabusPerCourse: Record<string, Message[]>  // 講義ページ単位
}
```
