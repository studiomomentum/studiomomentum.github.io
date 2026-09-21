import os

# 12대 핵심 지역
REGIONS = {
    "dongtan": {
        "name": "동탄·화성",
        "sub": "동탄1·2신도시, 동탄역, 화성시, 오산",
        "tag": "DONGTAN & HWASEONG",
        "areaServed": ["동탄", "화성", "오산", "수원"]
    },
    "pangyo": {
        "name": "판교·분당",
        "sub": "판교테크노밸리, 분당, 서현, 정자, 성남",
        "tag": "PANGYO & BUNDANG",
        "areaServed": ["판교", "분당", "성남", "수서"]
    },
    "gangnam": {
        "name": "강남·서초",
        "sub": "신사, 압구정, 청담, 강남역, 서초, 교대, 양재",
        "tag": "GANGNAM & SEOCHO",
        "areaServed": ["강남", "서초", "송파", "서울 전역"]
    },
    "suwon": {
        "name": "수원·광교",
        "sub": "광교신도시, 인계동, 영통, 수원역, 팔달",
        "tag": "SUWON & GWANGGYO",
        "areaServed": ["수원", "광교", "영통", "용인"]
    },
    "yongin": {
        "name": "용인·수지",
        "sub": "수지구, 기흥구, 죽전, 동천, 보정, 처인구",
        "tag": "YONGIN & SUJI",
        "areaServed": ["용인", "수지", "기흥", "분당"]
    },
    "pyeongtaek": {
        "name": "평택·고덕",
        "sub": "고덕국제신도시, 평택지제역, 안성, 송탄",
        "tag": "PYEONGTAEK & GODEK",
        "areaServed": ["평택", "고덕", "안성", "천안"]
    },
    "songpa": {
        "name": "송파·잠실",
        "sub": "잠실, 문정법조타운, 가락, 위례신도시",
        "tag": "SONGPA & JAMSIL",
        "areaServed": ["송파", "잠실", "문정", "위례", "강동"]
    },
    "anyang": {
        "name": "안양·평촌",
        "sub": "평촌학원가, 범계, 인덕원, 군포, 산본, 의왕",
        "tag": "ANYANG & PYEONGCHON",
        "areaServed": ["안양", "평촌", "인덕원", "군포", "의왕"]
    },
    "yeouido": {
        "name": "여의도·영등포",
        "sub": "여의도 국제금융, 마포, 공덕, 영등포, 당산",
        "tag": "YEOUIDO & MAPO",
        "areaServed": ["여의도", "마포", "공덕", "영등포"]
    },
    "gasan": {
        "name": "가산·구로",
        "sub": "가산디지털단지(G밸리), 구로디지털단지, 금천, 신도림",
        "tag": "GASAN & GURO G-VALLEY",
        "areaServed": ["가산", "구로", "금천", "영등포", "광명"]
    },
    "ilsan": {
        "name": "일산·고양",
        "sub": "일산호수공원, 킨텍스, 마두, 주엽, 삼송, 원흥, 파주운정",
        "tag": "ILSAN & GOYANG",
        "areaServed": ["일산", "고양", "파주", "김포"]
    },
    "incheon": {
        "name": "인천·송도",
        "sub": "송도국제도시, 청라, 부평, 구월동, 영종",
        "tag": "INCHEON & SONGDO",
        "areaServed": ["인천", "송도", "청라", "부평", "부천"]
    }
}

# 5대 고단가 전문직 업종
INDUSTRIES = {
    "hospital": {
        "name": "병원·의원·피부과",
        "target": "원장님",
        "schemaType": "MedicalBusiness",
        "icon": "🏥",
        "metaDesc": "원장님 준비 시간 0분! 환자 유입 결핍을 파고드는 완주형 심리 대본, 프롬프터 촬영, 고급 모션그래픽 턴키 제작으로 사내 PD 채용 리스크를 완벽히 해결합니다.",
        "h1": "병원·의원 원장님을 위한<br><span class=\"highlight\">원고 작성 0분, 턴키 유튜브 전담 솔루션</span>",
        "painHeader": "병원 원장님들이 겪는 3대 유튜브 고충 완벽 해결",
        "painPoints": [
            ("대본 작성 스트레스 0%", "전문 의료 기획팀이 환자의 검색 심리와 불안 요소를 분석하여 프롬프터 전용 대본을 100% 작성 납품합니다."),
            ("사내 PD 채용비 50% 절감", "월 400만 원 고정 인건비와 천만 원대 촬영/편집 장비 구매 없이, 고품격 월간 구독형으로 해결합니다."),
            ("현장 출장 디렉팅 지원", "병원 직접 방문을 통한 고화질 카메라/조명 세팅 및 1:1 촬영 코칭으로 원장님의 시간을 30분 이내로 아껴드립니다.")
        ],
        "specialties": "정형외과 · 피부과 · 성형외과 · 치과(임플란트) · 안과 · 신경외과 · 한의원 등 고관여 신뢰가 필수적인 전문 병의원"
    },
    "lawfirm": {
        "name": "법무법인·변호사",
        "target": "대표 변호사님",
        "schemaType": "LegalService",
        "icon": "⚖️",
        "metaDesc": "의뢰인 수임 전환을 극대화하는 승소 심리 대본, 모션그래픽 인포그래픽, 프롬프터 턴키 제작. 사내 PD 구인난과 퇴사 리스크를 제로화합니다.",
        "h1": "법무법인·변호사님을 위한<br><span class=\"highlight\">의뢰인 수임 직결 턴키 유튜브 프로덕션</span>",
        "painHeader": "로펌 및 대표 변호사님들이 겪는 3대 유튜브 고충 해결",
        "painPoints": [
            ("수임 전환 전문 판례 대본 100% 작성", "단순 법률 조문 나열이 아닌, 의뢰인이 당장 상담을 신청할 수밖에 없는 심리 트리거 기반 대본을 전담합니다."),
            ("판례·증거자료 맞춤 모션그래픽", "복잡한 법률 쟁점과 판결문, 타임라인을 한눈에 각인시키는 방송급 2D/3D 모션그래픽 편집 일체 지원."),
            ("사내 PD 관리 및 이직 리스크 해소", "법률 전문 지식이 없어 겉돌다 퇴사하는 사내 PD 대신, 검증된 B2B 전담팀이 100% 완제품으로 납품합니다.")
        ],
        "specialties": "기업법무 · 이혼/가사 · 형사전문 · 부동산/건설 분쟁 · 상속/증여 · 특허/지식재산권 전문 법무법인 및 법률사무소"
    },
    "tax": {
        "name": "세무회계·세무사",
        "target": "대표 세무사님",
        "schemaType": "AccountingService",
        "icon": "📊",
        "metaDesc": "자산가와 법인 대표를 타깃하는 고단가 절세 컨설팅 수임 유튜브. 복잡한 세법을 시각화하는 인포그래픽과 100% 대본 전담 턴키 제작.",
        "h1": "세무법인·대표 세무사님을 위한<br><span class=\"highlight\">고액 자산가·법인 수임 전담 유튜브 솔루션</span>",
        "painHeader": "세무법인 및 세무사님이 겪는 3대 유튜브 고충 해결",
        "painPoints": [
            ("절세 수임 타깃 세법 대본 100% 전담", "개정 세법과 자산가들의 핵심 절세 니즈(상속·증여·가업승계)를 파고드는 고품격 대본을 제공합니다."),
            ("세액 계산 & 절세표 모션그래픽 시각화", "난해한 세금 계산 구조를 직관적인 차트와 인포그래픽 모션그래픽으로 구현하여 전문성을 극대화합니다."),
            ("사내 직원 업무 과중 및 채용 부담 제거", "신고 기간마다 바쁜 사내 인력에게 영상 업무를 맡기는 비효율을 없애고, 대표님은 30분 촬영만 진행하시면 됩니다.")
        ],
        "specialties": "상속·증여세 전문 · 가업승계 컨설팅 · 법인 세무조정 · 부동산 절세 · 양도소득세 전문 세무법인 및 세무회계사무소"
    },
    "realty": {
        "name": "부동산·분양·중개법인",
        "target": "대표님 / 본부장님",
        "schemaType": "RealEstateAgent",
        "icon": "🏢",
        "metaDesc": "투자자와 실입주자의 매수 심리를 자극하는 상권/입지 분석 모션그래픽 유튜브. 현장 촬영부터 턴키 완제 납품까지 전담합니다.",
        "h1": "부동산·분양·중개법인을 위한<br><span class=\"highlight\">계약 전환율 300% 극대화 턴키 유튜브 솔루션</span>",
        "painHeader": "부동산 개발·분양·중개법인의 3대 영상 마케팅 고민 해결",
        "painPoints": [
            ("투자자 심리를 흔드는 입지 분석 대본", "단순 매물 소개가 아닌 호재, 배후 수요, 수익률 분석을 엮어낸 고밀도 투자 브리핑 대본을 100% 작성합니다."),
            ("지도·CG·수익률 인포그래픽 모션그래픽", "드론 영상 위에 상권 반경, 교통 호재 라인을 정밀 합성하는 프리미엄 모션그래픽으로 신뢰도를 구축합니다."),
            ("단기 외주 프리랜서의 잠적/품질 편차 해결", "일정 펑크 없는 철저한 턴키 전담 시스템으로 분양/계약 시즌에 맞춘 정기적인 영상 발행을 완벽 보장합니다.")
        ],
        "specialties": "상가·오피스 분양대행 · 지식산업센터 · 빌딩/토지 중개법인 · 하이엔드 주거 분양 · 부동산 자산관리회사"
    },
    "academy": {
        "name": "프리미엄 입시·학원",
        "target": "원장님 / 대표강사님",
        "schemaType": "EducationalOrganization",
        "icon": "🎓",
        "metaDesc": "학부모와 수험생의 등록 문의를 폭증시키는 입시 전략 및 1등급 킬러 콘텐츠 유튜브. 사내 PD 채용보다 50% 저렴한 고품격 턴키 제작.",
        "h1": "프리미엄 입시·대형학원 원장님을 위한<br><span class=\"highlight\">원생 등록 직결 턴키 유튜브 프로덕션</span>",
        "painHeader": "학원 원장님 및 스타강사님이 겪는 3대 유튜브 고충 해결",
        "painPoints": [
            ("학부모 설명회급 입시 전략 대본 100% 제공", "최신 입시 요강과 과목별 킬러 문항 공략법을 녹여낸 전문 대본을 제작하여 학원의 입시 전문성을 각인시킵니다."),
            ("도표·킬러문항 판서 모션그래픽", "복잡한 문제 풀이와 등급컷 변화를 생동감 있는 모션그래픽으로 시각화하여 학생들의 완주율을 극대화합니다."),
            ("강의 준비에만 집중하는 턴키 시스템", "원장님과 강사님은 강의와 교재 연구에만 집중하시고, 유튜브 기획·대본·촬영코칭·편집은 모멘텀이 100% 전담합니다.")
        ],
        "specialties": "의치한약수 입시전문 · 대형 재수기숙학원 · 고등 수능단과 · 프리미엄 어학원 · 예체능 입시학원"
    }
}

OUTPUT_DIR = "/Users/pc/Desktop/PD/06_개발도구/자체제작프로그램/cocked-pisto.github.io"

TEMPLATE = """<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0">
  <title>{region_name} {ind_name} 전문 유튜브 턴키 전담 프로덕션 | 스튜디오 모멘텀</title>
  <meta name="description" content="{region_name}({region_sub}) {ind_name} {target}을 위한 100% 대본 전담 및 프롬프터 촬영, 고급 모션그래픽 턴키 제작 솔루션. {meta_desc}">
  <link rel="canonical" href="https://studiomomentum.github.io/{filename}">
  
  <meta property="og:title" content="{region_name} {ind_name} 전문 유튜브 올인원 턴키 프로덕션 | 스튜디오 모멘텀">
  <meta property="og:description" content="{target} 준비 시간 0분! 사내 PD 채용 리스크 없이 완벽한 유튜브 채널 운영을 실현합니다.">
  <meta property="og:url" content="https://studiomomentum.github.io/{filename}">

  <script type="application/ld+json">
  {{
    "@context": "https://schema.org",
    "@type": "{schema_type}",
    "name": "스튜디오 모멘텀 {region_name} {ind_name} 유튜브 센터",
    "url": "https://studiomomentum.github.io/{filename}",
    "areaServed": {area_served_json},
    "description": "{region_name} 및 인근 지역 {ind_name} 전담 유튜브 심리 대본 작성, 프롬프터 촬영 코칭, 모션그래픽 편집 턴키 대행"
  }}
  </script>

  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css">
  <style>
    :root {{ --primary: #1d4ed8; --primary-hover: #1e40af; --bg: #f8fafc; --surface: #ffffff; --border: #e2e8f0; --text-title: #0f172a; --text-body: #334155; }}
    body {{ font-family: "Pretendard", -apple-system, BlinkMacSystemFont, system-ui, Roboto, sans-serif; background: var(--bg); color: var(--text-body); line-height: 1.8; margin: 0; padding: 0; word-break: keep-all; }}
    .container {{ max-width: 860px; margin: 0 auto; padding: 40px 20px 80px; }}
    .header-tag {{ display: inline-block; background: #eff6ff; color: var(--primary); padding: 5px 14px; border-radius: 6px; font-size: 13px; font-weight: 800; letter-spacing: 0.5px; margin-bottom: 14px; border: 1px solid #dbeafe; }}
    h1 {{ font-size: 28px; font-weight: 800; color: var(--text-title); line-height: 1.45; margin-bottom: 16px; letter-spacing: -0.5px; }}
    .sub-lead {{ font-size: 16px; color: #475569; margin-bottom: 32px; }}
    .card {{ background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 30px; margin-bottom: 24px; box-shadow: 0 4px 16px rgba(0,0,0,0.03); }}
    h2 {{ font-size: 20px; font-weight: 800; color: var(--text-title); margin-top: 0; margin-bottom: 18px; }}
    .highlight {{ color: var(--primary); font-weight: 800; }}
    ul.pain-list {{ padding-left: 20px; margin: 0; }}
    ul.pain-list li {{ margin-bottom: 14px; font-size: 15px; }}
    ul.pain-list li strong {{ color: var(--text-title); }}
    .cta-box {{ background: linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 100%); color: white; border-radius: 20px; padding: 36px 24px; text-align: center; margin-top: 40px; box-shadow: 0 10px 25px rgba(29, 78, 216, 0.2); }}
    .cta-btn {{ display: inline-block; background: #ffffff; color: #1e3a8a; padding: 15px 32px; border-radius: 12px; font-weight: 800; font-size: 16px; text-decoration: none; margin-top: 18px; transition: transform 0.2s, box-shadow 0.2s; box-shadow: 0 4px 12px rgba(0,0,0,0.15); }}
    .cta-btn:hover {{ transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.25); }}
    .nav-link {{ margin-top: 18px; }}
    .nav-link a {{ color: #bfdbfe; font-size: 13.5px; text-decoration: underline; }}
    @media (max-width: 640px) {{
      h1 {{ font-size: 23px; }}
      .card {{ padding: 20px; }}
      .cta-box {{ padding: 28px 18px; }}
    }}
  </style>
</head>
<body>
  <div class="container">
    <span class="header-tag">{icon} {region_tag} {ind_tag} PRODUCTION</span>
    <h1>{region_name} {h1_content}</h1>
    <p class="sub-lead">{region_name} ({region_sub}) 지역 {ind_name} {target}을 위해, 복잡한 유튜브 제작 과정을 100% 완제품으로 전담해 드립니다. {meta_desc}</p>

    <div class="card">
      <h2>{region_name} {pain_header}</h2>
      <ul class="pain-list">
        <li><strong>{pain1_title}</strong>: {pain1_desc}</li>
        <li><strong>{pain2_title}</strong>: {pain2_desc}</li>
        <li><strong>{pain3_title}</strong>: {pain3_desc}</li>
      </ul>
    </div>

    <div class="card">
      <h2>주요 전담 세부 분야</h2>
      <p style="margin:0; font-size:15px; color:#475569;">{specialties}</p>
    </div>

    <div class="card" style="background:#f0fdf4; border-color:#bbf7d0;">
      <h2 style="color:#166534; margin-bottom:10px;">💡 사내 PD 채용 대비 연간 3,000만 원 이상 절감</h2>
      <p style="margin:0; font-size:14.5px; color:#15803d; line-height:1.7;">
        사내 PD 직접 고용 시 발생하는 4대보험, 퇴직충당금, 고사양 장비 비용 및 이직/퇴사 리스크 없이, 스튜디오 모멘텀의 검증된 턴키 시스템으로 고품질 영상을 안정적으로 공급받으세요.
      </p>
    </div>

    <div class="cta-box">
      <h3 style="margin-top:0; font-size:22px; font-weight:800;">{region_name} {ind_name} 1:1 맞춤 견적 및 채널 진단</h3>
      <p style="opacity:0.92; font-size:14.5px; margin-bottom:4px;">{target}의 소중한 시간을 가장 아껴드리는 최적의 턴키 제작 플랜을 안내해 드립니다.</p>
      <a href="https://open.kakao.com/o/sEX8RWNi" target="_blank" class="cta-btn">1:1 빠른 카카오톡 상담하기 →</a>
      <div class="nav-link"><a href="https://studiomomentum.github.io/">← 스튜디오 모멘텀 메인 홈 & 실시간 비용 계산기 보기</a></div>
    </div>
  </div>
</body>
</html>
"""

all_urls = [
    "https://studiomomentum.github.io/",
    "https://studiomomentum.github.io/research-2026-retention.html"
]

generated_count = 0

import json

for r_key, r_info in REGIONS.items():
    for i_key, i_info in INDUSTRIES.items():
        filename = f"{r_key}-{i_key}.html"
        file_path = os.path.join(OUTPUT_DIR, filename)
        
        # Build template vars
        content = TEMPLATE.format(
            region_name=r_info["name"],
            region_sub=r_info["sub"],
            region_tag=r_info["tag"],
            ind_name=i_info["name"],
            ind_tag=i_key.upper(),
            target=i_info["target"],
            filename=filename,
            schema_type=i_info["schemaType"],
            area_served_json=json.dumps(r_info["areaServed"], ensure_ascii=False),
            icon=i_info["icon"],
            meta_desc=i_info["metaDesc"],
            h1_content=i_info["h1"],
            pain_header=i_info["painHeader"],
            pain1_title=i_info["painPoints"][0][0],
            pain1_desc=i_info["painPoints"][0][1],
            pain2_title=i_info["painPoints"][1][0],
            pain2_desc=i_info["painPoints"][1][1],
            pain3_title=i_info["painPoints"][2][0],
            pain3_desc=i_info["painPoints"][2][1],
            specialties=i_info["specialties"]
        )
        
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(content)
            
        all_urls.append(f"https://studiomomentum.github.io/{filename}")
        generated_count += 1

print(f"Generated {generated_count} pSEO landing pages successfully.")

# Generate Comprehensive sitemap.xml
sitemap_content = ['<?xml version="1.0" encoding="UTF-8"?>',
'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']

for url in all_urls:
    priority = "1.0" if url == "https://studiomomentum.github.io/" else ("0.9" if "research" in url else "0.8")
    sitemap_content.append(f"""  <url>
    <loc>{url}</loc>
    <lastmod>2026-09-21</lastmod>
    <changefreq>daily</changefreq>
    <priority>{priority}</priority>
  </url>""")

sitemap_content.append('</urlset>')

sitemap_path = os.path.join(OUTPUT_DIR, "sitemap.xml")
with open(sitemap_path, "w", encoding="utf-8") as f:
    f.write("\n".join(sitemap_content))

print("Updated sitemap.xml with all URLs.")
