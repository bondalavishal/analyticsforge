import csv
import logging
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

BUNDLED_DATASETS = [
    {"name": "titanic", "description": "Titanic passenger survival data", "topic_tags": ["JOIN", "Aggregation", "Filtering"]},
    {"name": "hr_analytics", "description": "HR employee attrition and performance", "topic_tags": ["GROUP BY", "Window Function", "Subquery"]},
    {"name": "ecommerce_orders", "description": "E-commerce orders, products and customers", "topic_tags": ["JOIN", "CTE", "Aggregation"]},
    {"name": "netflix_shows", "description": "Netflix movies and TV shows catalog", "topic_tags": ["Filtering", "String Functions", "GROUP BY"]},
    {"name": "spotify_tracks", "description": "Spotify track features and popularity", "topic_tags": ["Aggregation", "Window Function", "Subquery"]},
    {"name": "world_happiness", "description": "World Happiness Report data by country", "topic_tags": ["Ranking", "Window Function", "Aggregation"]},
    {"name": "covid_stats", "description": "COVID-19 country-level statistics", "topic_tags": ["Aggregation", "Date Functions", "GROUP BY"]},
    {"name": "olympics", "description": "Olympic Games athletes and medals", "topic_tags": ["JOIN", "GROUP BY", "Ranking"]},
    {"name": "movie_ratings", "description": "Movie ratings and genres", "topic_tags": ["JOIN", "Aggregation", "Subquery"]},
    {"name": "sales_performance", "description": "Sales team performance metrics", "topic_tags": ["CTE", "Window Function", "Aggregation"]},
]

BUNDLED_SCHEMAS = {
    "titanic": {
        "schema_sql": """
CREATE TABLE passengers (
    passenger_id INTEGER PRIMARY KEY,
    survived INTEGER,
    pclass INTEGER,
    name VARCHAR,
    sex VARCHAR,
    age FLOAT,
    sib_sp INTEGER,
    parch INTEGER,
    ticket VARCHAR,
    fare FLOAT,
    cabin VARCHAR,
    embarked VARCHAR
);""",
        "sample_data_sql": """
INSERT INTO passengers VALUES (1,0,3,'Braund, Mr. Owen Harris','male',22,1,0,'A/5 21171',7.25,NULL,'S');
INSERT INTO passengers VALUES (2,1,1,'Cumings, Mrs. John Bradley','female',38,1,0,'PC 17599',71.28,'C85','C');
INSERT INTO passengers VALUES (3,1,3,'Heikkinen, Miss. Laina','female',26,0,0,'STON/O2. 3101282',7.92,NULL,'S');
INSERT INTO passengers VALUES (4,1,1,'Futrelle, Mrs. Jacques Heath','female',35,1,0,'113803',53.1,'C123','S');
INSERT INTO passengers VALUES (5,0,3,'Allen, Mr. William Henry','male',35,0,0,'373450',8.05,NULL,'S');
""",
    },
    "hr_analytics": {
        "schema_sql": """
CREATE TABLE employees (
    employee_id INTEGER PRIMARY KEY,
    name VARCHAR,
    age INTEGER,
    department VARCHAR,
    job_role VARCHAR,
    salary INTEGER,
    years_at_company INTEGER,
    performance_rating INTEGER,
    attrition VARCHAR,
    manager_id INTEGER
);
CREATE TABLE departments (
    department_id INTEGER PRIMARY KEY,
    department_name VARCHAR,
    head_count INTEGER,
    budget INTEGER
);""",
        "sample_data_sql": """
INSERT INTO employees VALUES (1,'Alice Chen',32,'Engineering','Senior Engineer',120000,5,4,'No',10);
INSERT INTO employees VALUES (2,'Bob Smith',28,'Marketing','Marketing Manager',85000,3,3,'Yes',11);
INSERT INTO employees VALUES (3,'Carol Davis',45,'Engineering','Lead Engineer',150000,12,5,'No',10);
INSERT INTO employees VALUES (4,'Dan Lee',35,'HR','HR Specialist',65000,7,3,'No',12);
INSERT INTO employees VALUES (5,'Eve Wilson',29,'Engineering','Junior Engineer',80000,2,4,'Yes',10);
INSERT INTO departments VALUES (1,'Engineering',50,5000000);
INSERT INTO departments VALUES (2,'Marketing',20,2000000);
INSERT INTO departments VALUES (3,'HR',10,800000);
""",
    },
    "ecommerce_orders": {
        "schema_sql": """
CREATE TABLE customers (
    customer_id INTEGER PRIMARY KEY,
    name VARCHAR,
    email VARCHAR,
    city VARCHAR,
    country VARCHAR,
    registered_date DATE
);
CREATE TABLE products (
    product_id INTEGER PRIMARY KEY,
    name VARCHAR,
    category VARCHAR,
    price FLOAT,
    stock INTEGER
);
CREATE TABLE orders (
    order_id INTEGER PRIMARY KEY,
    customer_id INTEGER,
    order_date DATE,
    status VARCHAR,
    total_amount FLOAT
);
CREATE TABLE order_items (
    item_id INTEGER PRIMARY KEY,
    order_id INTEGER,
    product_id INTEGER,
    quantity INTEGER,
    unit_price FLOAT
);""",
        "sample_data_sql": """
INSERT INTO customers VALUES (1,'John Doe','john@email.com','New York','USA','2022-01-15');
INSERT INTO customers VALUES (2,'Jane Smith','jane@email.com','London','UK','2022-03-20');
INSERT INTO customers VALUES (3,'Bob Johnson','bob@email.com','Sydney','Australia','2023-06-01');
INSERT INTO products VALUES (1,'Laptop','Electronics',999.99,50);
INSERT INTO products VALUES (2,'Mouse','Electronics',29.99,200);
INSERT INTO products VALUES (3,'Desk Chair','Furniture',299.99,30);
INSERT INTO orders VALUES (1,1,'2024-01-10','completed',1029.98);
INSERT INTO orders VALUES (2,1,'2024-02-15','completed',29.99);
INSERT INTO orders VALUES (3,2,'2024-01-20','shipped',299.99);
INSERT INTO order_items VALUES (1,1,1,1,999.99);
INSERT INTO order_items VALUES (2,1,2,1,29.99);
INSERT INTO order_items VALUES (3,2,2,1,29.99);
INSERT INTO order_items VALUES (4,3,3,1,299.99);
""",
    },
    "netflix_shows": {
        "schema_sql": """
CREATE TABLE titles (
    show_id VARCHAR PRIMARY KEY,
    type VARCHAR,
    title VARCHAR,
    director VARCHAR,
    country VARCHAR,
    date_added DATE,
    release_year INTEGER,
    rating VARCHAR,
    duration VARCHAR,
    listed_in VARCHAR,
    description VARCHAR
);""",
        "sample_data_sql": """
INSERT INTO titles VALUES ('s1','Movie','Dick Johnson Is Dead','Kirsten Johnson','United States','2021-09-25',2020,'PG-13','90 min','Documentaries','A daughter films her father''s death.');
INSERT INTO titles VALUES ('s2','TV Show','Blood & Water',NULL,'South Africa','2021-09-24',2021,'TV-MA','2 Seasons','International TV Shows','A teen infiltrates a school to find her sister.');
INSERT INTO titles VALUES ('s3','TV Show','Ganglands','Julien Leclercq','France','2021-09-24',2021,'TV-MA','1 Season','Crime TV Shows','A master thief and his nephew run a gang.');
INSERT INTO titles VALUES ('s4','TV Show','Jailbirds New Orleans',NULL,'United States','2021-09-24',2021,'TV-MA','1 Season','Docuseries','Inside the Orleans Justice Center jail.');
INSERT INTO titles VALUES ('s5','TV Show','Kota Factory',NULL,'India','2021-09-24',2021,'TV-MA','2 Seasons','International TV Shows','Life of students at a coaching institute.');
INSERT INTO titles VALUES ('s6','TV Show','Midnight Mass','Mike Flanagan','United States','2021-09-24',2021,'TV-MA','1 Season','Horror TV Shows','A charismatic priest arrives on a small island.');
INSERT INTO titles VALUES ('s7','Movie','My Little Pony: A New Generation',NULL,'United States','2021-09-24',2021,'PG','91 min','Children & Family Movies','An unlikely hero sets off on a journey.');
INSERT INTO titles VALUES ('s8','Movie','Sankofa','Haile Gerima','United States','2021-09-24',1993,'TV-MA','125 min','Dramas','A fashion model is transported back to slavery.');
INSERT INTO titles VALUES ('s9','TV Show','The Great British Baking Show',NULL,'United Kingdom','2021-09-24',2021,'TV-14','9 Seasons','British TV Shows','Amateur bakers compete for the title.');
INSERT INTO titles VALUES ('s10','Movie','The Starling','Theodore Melfi','United States','2021-09-24',2021,'PG-13','104 min','Comedies','A woman adjusts to life after a tragedy.');
""",
    },
    "spotify_tracks": {
        "schema_sql": """
CREATE TABLE tracks (
    track_id VARCHAR PRIMARY KEY,
    track_name VARCHAR,
    artist_name VARCHAR,
    album_name VARCHAR,
    release_date DATE,
    duration_ms INTEGER,
    popularity INTEGER,
    danceability FLOAT,
    energy FLOAT,
    loudness FLOAT,
    speechiness FLOAT,
    acousticness FLOAT,
    valence FLOAT,
    tempo FLOAT,
    explicit INTEGER
);
CREATE TABLE artists (
    artist_id VARCHAR PRIMARY KEY,
    artist_name VARCHAR,
    genres VARCHAR,
    followers INTEGER,
    popularity INTEGER
);""",
        "sample_data_sql": """
INSERT INTO tracks VALUES ('4iV5W9uYEdYUVa79Axb7Rh','Mr. Brightside','The Killers','Hot Fuss','2003-06-15',222960,85,0.357,0.924,-2.634,0.0807,0.000233,0.268,148.114,0);
INSERT INTO tracks VALUES ('7ouMYWpwJ422jRcDASZB7P','Knights of Cydonia','Muse','Black Holes and Revelations','2006-07-17',366213,75,0.458,0.978,-4.358,0.0538,0.000522,0.225,173.348,0);
INSERT INTO tracks VALUES ('0VjIjW4GlUZAMYd2vXMi3b','Blinding Lights','The Weeknd','After Hours','2019-11-29',200040,95,0.514,0.73,-5.934,0.0598,0.00146,0.334,171.005,0);
INSERT INTO tracks VALUES ('6UelLqGlWMcVH1E5c4H7lY','Watermelon Sugar','Harry Styles','Fine Line','2019-12-13',174000,89,0.548,0.816,-4.209,0.0467,0.122,0.557,95.39,0);
INSERT INTO tracks VALUES ('1zi7xx7UVEFkmKfv06H8x0','Someone You Loved','Lewis Capaldi','Divinely Uninspired','2018-11-08',182161,91,0.501,0.321,-6.504,0.0266,0.73,0.261,109.012,0);
INSERT INTO artists VALUES ('0C8ZW7ezQVs4URX5aX7Kqx','The Weeknd','pop,r&b',35000000,95);
INSERT INTO artists VALUES ('6KImCVD70vtIoJWnq6nGn3','Harry Styles','pop',22000000,89);
INSERT INTO artists VALUES ('4oLeXFyACqeem2VImYeBFe','Lewis Capaldi','pop,singer-songwriter',12000000,87);
""",
    },
    "world_happiness": {
        "schema_sql": """
CREATE TABLE happiness (
    id INTEGER PRIMARY KEY,
    country VARCHAR,
    region VARCHAR,
    year INTEGER,
    happiness_rank INTEGER,
    happiness_score FLOAT,
    gdp_per_capita FLOAT,
    social_support FLOAT,
    healthy_life_expectancy FLOAT,
    freedom_to_make_choices FLOAT,
    generosity FLOAT,
    perceptions_of_corruption FLOAT
);""",
        "sample_data_sql": """
INSERT INTO happiness VALUES (1,'Finland','Western Europe',2023,1,7.804,1.892,1.587,0.972,0.661,0.142,0.179);
INSERT INTO happiness VALUES (2,'Denmark','Western Europe',2023,2,7.586,1.953,1.582,0.972,0.661,0.263,0.179);
INSERT INTO happiness VALUES (3,'Iceland','Western Europe',2023,3,7.525,1.936,1.624,1.026,0.662,0.354,0.048);
INSERT INTO happiness VALUES (4,'Israel','Middle East and North Africa',2023,4,7.473,1.803,1.513,0.953,0.549,0.145,0.081);
INSERT INTO happiness VALUES (5,'Netherlands','Western Europe',2023,5,7.403,1.942,1.573,0.973,0.654,0.242,0.233);
INSERT INTO happiness VALUES (6,'Sweden','Western Europe',2023,6,7.395,1.943,1.567,0.977,0.658,0.221,0.237);
INSERT INTO happiness VALUES (7,'Norway','Western Europe',2023,7,7.315,1.993,1.582,0.984,0.669,0.269,0.176);
INSERT INTO happiness VALUES (8,'Switzerland','Western Europe',2023,8,7.24,1.987,1.591,1.029,0.657,0.291,0.272);
INSERT INTO happiness VALUES (9,'Australia','Australia and New Zealand',2023,9,7.192,1.894,1.566,0.986,0.653,0.291,0.142);
INSERT INTO happiness VALUES (10,'Canada','North America and ANZ',2023,10,7.164,1.881,1.559,0.976,0.64,0.305,0.136);
""",
    },
    "covid_stats": {
        "schema_sql": """
CREATE TABLE covid_stats (
    id INTEGER PRIMARY KEY,
    country VARCHAR,
    continent VARCHAR,
    date DATE,
    total_cases INTEGER,
    new_cases INTEGER,
    total_deaths INTEGER,
    new_deaths INTEGER,
    total_tests INTEGER,
    population INTEGER
);
CREATE TABLE country_info (
    country VARCHAR PRIMARY KEY,
    continent VARCHAR,
    population INTEGER,
    median_age FLOAT,
    gdp_per_capita FLOAT,
    hospital_beds_per_thousand FLOAT
);""",
        "sample_data_sql": """
INSERT INTO covid_stats VALUES (1,'United States','North America','2021-12-31',54941374,404491,825534,1429,728657958,332915073);
INSERT INTO covid_stats VALUES (2,'India','Asia','2021-12-31',34838804,9195,480290,302,660000000,1393409038);
INSERT INTO covid_stats VALUES (3,'Brazil','South America','2021-12-31',22282951,113549,618534,283,63500000,213993437);
INSERT INTO covid_stats VALUES (4,'United Kingdom','Europe','2021-12-31',12652624,189846,148440,146,318000000,67215293);
INSERT INTO covid_stats VALUES (5,'Germany','Europe','2021-12-31',7162253,42000,110432,175,96000000,83900471);
INSERT INTO country_info VALUES ('United States','North America',332915073,38.3,54225.0,2.87);
INSERT INTO country_info VALUES ('India','Asia',1393409038,28.2,6461.0,0.53);
INSERT INTO country_info VALUES ('Brazil','South America',213993437,33.5,14103.0,2.2);
INSERT INTO country_info VALUES ('United Kingdom','Europe',67215293,40.8,39753.0,2.54);
INSERT INTO country_info VALUES ('Germany','Europe',83900471,45.7,45229.0,8.0);
""",
    },
    "olympics": {
        "schema_sql": """
CREATE TABLE athletes (
    athlete_id INTEGER PRIMARY KEY,
    name VARCHAR,
    sex VARCHAR,
    age INTEGER,
    height INTEGER,
    weight FLOAT,
    team VARCHAR,
    noc VARCHAR,
    sport VARCHAR
);
CREATE TABLE events (
    event_id INTEGER PRIMARY KEY,
    games VARCHAR,
    year INTEGER,
    season VARCHAR,
    city VARCHAR,
    sport VARCHAR,
    event VARCHAR
);
CREATE TABLE medals (
    medal_id INTEGER PRIMARY KEY,
    athlete_id INTEGER,
    event_id INTEGER,
    medal VARCHAR
);""",
        "sample_data_sql": """
INSERT INTO athletes VALUES (1,'Michael Phelps','M',23,193,91.0,'United States','USA','Swimming');
INSERT INTO athletes VALUES (2,'Usain Bolt','M',22,195,88.0,'Jamaica','JAM','Athletics');
INSERT INTO athletes VALUES (3,'Simone Biles','F',19,142,47.0,'United States','USA','Gymnastics');
INSERT INTO athletes VALUES (4,'Katie Ledecky','F',19,183,70.0,'United States','USA','Swimming');
INSERT INTO athletes VALUES (5,'Eliud Kipchoge','M',31,167,57.0,'Kenya','KEN','Athletics');
INSERT INTO athletes VALUES (6,'Nadia Comaneci','F',14,161,50.0,'Romania','ROU','Gymnastics');
INSERT INTO events VALUES (1,'2008 Summer Olympics',2008,'Summer','Beijing','Swimming','100m Freestyle Men');
INSERT INTO events VALUES (2,'2008 Summer Olympics',2008,'Summer','Beijing','Athletics','100m Sprint Men');
INSERT INTO events VALUES (3,'2016 Summer Olympics',2016,'Summer','Rio','Gymnastics','Individual All-Around Women');
INSERT INTO events VALUES (4,'2016 Summer Olympics',2016,'Summer','Rio','Swimming','800m Freestyle Women');
INSERT INTO events VALUES (5,'2016 Summer Olympics',2016,'Summer','Rio','Athletics','Marathon Men');
INSERT INTO medals VALUES (1,1,1,'Gold');
INSERT INTO medals VALUES (2,2,2,'Gold');
INSERT INTO medals VALUES (3,3,3,'Gold');
INSERT INTO medals VALUES (4,4,4,'Gold');
INSERT INTO medals VALUES (5,5,5,'Gold');
""",
    },
    "movie_ratings": {
        "schema_sql": """
CREATE TABLE movies (
    movie_id INTEGER PRIMARY KEY,
    title VARCHAR,
    release_year INTEGER,
    genre VARCHAR,
    director VARCHAR,
    duration_minutes INTEGER,
    budget_million FLOAT,
    box_office_million FLOAT
);
CREATE TABLE users (
    user_id INTEGER PRIMARY KEY,
    username VARCHAR,
    age INTEGER,
    country VARCHAR
);
CREATE TABLE ratings (
    rating_id INTEGER PRIMARY KEY,
    movie_id INTEGER,
    user_id INTEGER,
    rating FLOAT,
    review_date DATE
);""",
        "sample_data_sql": """
INSERT INTO movies VALUES (1,'The Shawshank Redemption',1994,'Drama','Frank Darabont',142,25.0,16.0);
INSERT INTO movies VALUES (2,'The Godfather',1972,'Crime','Francis Ford Coppola',175,6.0,250.0);
INSERT INTO movies VALUES (3,'The Dark Knight',2008,'Action','Christopher Nolan',152,185.0,1005.0);
INSERT INTO movies VALUES (4,'Pulp Fiction',1994,'Crime','Quentin Tarantino',154,8.5,214.0);
INSERT INTO movies VALUES (5,'Forrest Gump',1994,'Drama','Robert Zemeckis',142,55.0,678.0);
INSERT INTO movies VALUES (6,'Inception',2010,'Sci-Fi','Christopher Nolan',148,160.0,836.0);
INSERT INTO movies VALUES (7,'The Matrix',1999,'Sci-Fi','Lana Wachowski',136,63.0,467.0);
INSERT INTO users VALUES (1,'alice_92',31,'USA');
INSERT INTO users VALUES (2,'bob_movies',45,'UK');
INSERT INTO users VALUES (3,'cinephile_raj',28,'India');
INSERT INTO users VALUES (4,'filmfan_sara',22,'Canada');
INSERT INTO ratings VALUES (1,1,1,9.5,'2023-01-10');
INSERT INTO ratings VALUES (2,1,2,9.0,'2023-02-14');
INSERT INTO ratings VALUES (3,2,1,9.8,'2023-01-12');
INSERT INTO ratings VALUES (4,3,3,9.2,'2023-03-05');
INSERT INTO ratings VALUES (5,4,4,8.9,'2023-04-20');
INSERT INTO ratings VALUES (6,5,2,8.5,'2023-05-01');
INSERT INTO ratings VALUES (7,6,1,8.8,'2023-06-15');
INSERT INTO ratings VALUES (8,7,3,8.7,'2023-07-22');
""",
    },
    "sales_performance": {
        "schema_sql": """
CREATE TABLE sales_reps (
    rep_id INTEGER PRIMARY KEY,
    name VARCHAR,
    region VARCHAR,
    team_lead VARCHAR,
    hire_date DATE,
    base_salary INTEGER
);
CREATE TABLE sales (
    sale_id INTEGER PRIMARY KEY,
    rep_id INTEGER,
    product VARCHAR,
    category VARCHAR,
    amount FLOAT,
    units INTEGER,
    sale_date DATE,
    quarter VARCHAR,
    customer_type VARCHAR
);
CREATE TABLE targets (
    target_id INTEGER PRIMARY KEY,
    rep_id INTEGER,
    quarter VARCHAR,
    target_amount FLOAT
);""",
        "sample_data_sql": """
INSERT INTO sales_reps VALUES (1,'James Carter','North','Lisa Park','2020-03-15',55000);
INSERT INTO sales_reps VALUES (2,'Maria Lopez','South','Tom Reed','2019-07-01',58000);
INSERT INTO sales_reps VALUES (3,'Kevin Zhang','West','Lisa Park','2021-01-10',52000);
INSERT INTO sales_reps VALUES (4,'Sarah Kim','East','Tom Reed','2018-11-20',60000);
INSERT INTO sales_reps VALUES (5,'Daniel Brown','North','Lisa Park','2022-05-01',50000);
INSERT INTO sales VALUES (1,1,'Enterprise Suite','Software',45000.0,1,'2024-01-15','Q1-2024','Enterprise');
INSERT INTO sales VALUES (2,1,'Basic Plan','Software',1200.0,5,'2024-01-22','Q1-2024','SMB');
INSERT INTO sales VALUES (3,2,'Enterprise Suite','Software',52000.0,1,'2024-02-10','Q1-2024','Enterprise');
INSERT INTO sales VALUES (4,3,'Pro Plan','Software',3600.0,3,'2024-02-18','Q1-2024','SMB');
INSERT INTO sales VALUES (5,4,'Enterprise Suite','Software',48000.0,1,'2024-03-05','Q1-2024','Enterprise');
INSERT INTO sales VALUES (6,2,'Hardware Bundle','Hardware',15000.0,10,'2024-03-12','Q1-2024','Enterprise');
INSERT INTO sales VALUES (7,1,'Pro Plan','Software',2400.0,2,'2024-04-03','Q2-2024','SMB');
INSERT INTO sales VALUES (8,5,'Basic Plan','Software',600.0,3,'2024-04-17','Q2-2024','SMB');
INSERT INTO targets VALUES (1,1,'Q1-2024',50000.0);
INSERT INTO targets VALUES (2,2,'Q1-2024',55000.0);
INSERT INTO targets VALUES (3,3,'Q1-2024',45000.0);
INSERT INTO targets VALUES (4,4,'Q1-2024',52000.0);
INSERT INTO targets VALUES (5,5,'Q1-2024',40000.0);
""",
    },
}


def get_bundled_datasets() -> List[Dict]:
    return BUNDLED_DATASETS


def load_bundled_dataset(name: str) -> Optional[Dict]:
    data = BUNDLED_SCHEMAS.get(name)
    if not data:
        return None
    meta = next((d for d in BUNDLED_DATASETS if d["name"] == name), {})
    return {
        "name": name,
        "description": meta.get("description", ""),
        "schema_sql": data["schema_sql"],
        "sample_data_sql": data["sample_data_sql"],
        "topic_tags": meta.get("topic_tags", []),
    }


async def search_kaggle_datasets(query: str, username: str, key: str) -> List[Dict]:
    """Search Kaggle datasets via API."""
    import httpx
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(
                "https://www.kaggle.com/api/v1/datasets/list",
                params={"search": query, "page": 1, "pageSize": 10},
                auth=(username, key),
            )
            response.raise_for_status()
            datasets = response.json()
            return [
                {
                    "ref": d.get("ref", ""),
                    "title": d.get("title", ""),
                    "subtitle": d.get("subtitle", ""),
                    "total_bytes": d.get("totalBytes", 0),
                    "url": f"https://www.kaggle.com/datasets/{d.get('ref', '')}",
                }
                for d in datasets
            ]
    except Exception as e:
        logger.error(f"Kaggle search failed: {e}")
        return []


def load_csv_as_schema_context(csv_path: str, table_name: str = "data") -> Dict[str, str]:
    """Convert uploaded CSV to CREATE TABLE + INSERT statements."""
    rows = []
    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        headers = reader.fieldnames or []
        for i, row in enumerate(reader):
            if i >= 100:  # Limit sample data
                break
            rows.append(row)

    if not headers:
        return {"schema_sql": "", "sample_data_sql": ""}

    # Infer types
    def infer_type(col: str) -> str:
        if not rows:
            return "VARCHAR"
        sample = rows[0].get(col, "")
        try:
            int(sample)
            return "INTEGER"
        except (ValueError, TypeError):
            pass
        try:
            float(sample)
            return "FLOAT"
        except (ValueError, TypeError):
            pass
        return "VARCHAR"

    col_defs = ", ".join(f"{h.replace(' ', '_').lower()} {infer_type(h)}" for h in headers)
    schema_sql = f"CREATE TABLE {table_name} ({col_defs});"

    insert_lines = []
    for row in rows[:20]:  # Only first 20 rows as sample
        vals = []
        for h in headers:
            v = row.get(h, "")
            if v is None or v == "":
                vals.append("NULL")
            else:
                try:
                    float(v)
                    vals.append(v)
                except ValueError:
                    vals.append(f"'{v.replace(chr(39), chr(39)+chr(39))}'")
        insert_lines.append(f"INSERT INTO {table_name} VALUES ({', '.join(vals)});")

    return {
        "schema_sql": schema_sql,
        "sample_data_sql": "\n".join(insert_lines),
        "columns": headers,
        "row_count": len(rows),
    }
