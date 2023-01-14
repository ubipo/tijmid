"""Natural Earth Shapefile to GeoJSON Converter

This script converts a Natural Earth shapefile [0] to GeoJSON. It is meant to
operate on the 1:110m Cultural Vectors map units shapefile but might work on
others as well. The merging decisions of this script are optimized for the use
case of autonomous system (AS) number to country mapping.  Note that Natural
Earth data is far from perfect, Taiwan for example has a ISO Alpha-2 code of TW
[1] (recognized as such by IANA [2]) and is de-facto independent but is listed
as CN in Natural Earth (as of 2022-11). Crimea on the other hand is de-facto
Russian, de-jure Ukrainian but mapped as Russian. For what it's worth, the
developers of Natural Earth claim to take a de-facto approach to disputed
territories.

The `ISO_A2_EH` ('EH' as in 'ok, but not great') and `ISO_A3_EH` fields are
mapped to `a2` and `a3` respectively. `NAME_LONG` or `ADMIN` is mapped to
`name`. Territories with the same ISO_A3_EH (e.g. UK countries) code are merged
into a single feature.

Known issues:
 - Palestine is named 'West Bank'


[0] https://www.naturalearthdata.com/downloads/110m-cultural-vectors/  

[1] https://www.iso.org/obp/ui/#iso:code:3166:TW

[2] https://www.iana.org/domains/root/db/xn--kpry57d.html
"""

import argparse
from pathlib import Path
import json
import shapefile
import shapely.geometry
import shapely.ops

def round_coordinates(coordinates, precision=2):
    """Round coordinates to a given precision.
    """
    if isinstance(coordinates, (float, int)):
        return round(coordinates, precision)
    return [round_coordinates(c, precision) for c in coordinates]

def na_shp2geojson(na_shp_path: Path, geojson_output_path: Path):
    """Convert a Natural Earth shapefile to GeoJSON.
    """
    na_shp = shapefile.Reader(na_shp_path)
    geojson = na_shp.__geo_interface__
    assert geojson['type'] == 'FeatureCollection'
    country_code_territories = {}
    for territory in geojson['features']:
        assert territory['type'] == 'Feature'
        iso_a3 = territory['properties']['ISO_A3_EH']
        if iso_a3 == '-99':
            iso_a3 = territory['properties']['ADM0_ISO']
        if iso_a3 == '-99':
            raise ValueError(
                f'Territory {territory["properties"]["NAME_LONG"]} has no '
                + 'ISO_A3_EH nor ADM0_ISO'
            )
        country_code_features = country_code_territories.setdefault(iso_a3, [])
        country_code_features.append(territory)

    world_territories = []
    for iso_a3, same_cc_territories in country_code_territories.items():
        if len(same_cc_territories) == 1:
            territory = same_cc_territories[0]
            territory['properties'] = dict(
                a2=territory['properties']['ISO_A2_EH'],
                a3=territory['properties']['ISO_A3_EH'],
                name=territory['properties']['NAME_LONG'],
            )
            territory['geometry']['coordinates'] = round_coordinates(territory['geometry']['coordinates'])
            world_territories.append(territory)
            continue

        disputed_territories = []
        non_disputed_territories = []
        for territory in same_cc_territories:
            if territory['properties']['ISO_A3_EH'] != iso_a3:
                disputed_territories.append(territory)
            else:
                non_disputed_territories.append(territory)

        if len(non_disputed_territories) == 0:
            raise ValueError(f'No non-disputed territories for {iso_a3}')

        merged_territory = non_disputed_territories[0]
        iso_a2 = merged_territory['properties']['ISO_A2_EH']
        admin_name = merged_territory['properties']['ADMIN']
        for territory in non_disputed_territories[1:]:
            error_first_line = f'Mismatch for {iso_a3}/{territory["properties"]["NAME_LONG"]} ({admin_name})'
            if territory['properties']['ISO_A2_EH'] != iso_a2:
                raise ValueError(
                    f'{error_first_line}: ISO_A2_EH {iso_a2} != {territory["properties"]["ISO_A2_EH"]}'
                )
            if territory['properties']['ISO_A3_EH'] != iso_a3:
                raise ValueError(
                    f'{error_first_line}: ISO_A3_EH {iso_a3} != {territory["properties"]["ISO_A3_EH"]}'
                )
            if territory['properties']['ADMIN'] != admin_name:
                raise ValueError(
                    f'{error_first_line}: ADMIN {admin_name} != {territory["properties"]["ADMIN"]}'
                )

        shapes = [shapely.geometry.shape(feature['geometry']) for feature in same_cc_territories]
        merged_geometry = shapely.ops.unary_union(shapes)
        merged_geometry_geojson = merged_geometry.__geo_interface__
        assert merged_geometry_geojson['type'] in ['MultiPolygon', 'Polygon']
        merged_geometry_geojson['coordinates'] = round_coordinates(merged_geometry_geojson['coordinates'])

        merged_territory['properties'] = dict(
            a2=iso_a2, a3=iso_a3, name=admin_name
        )
        merged_territory['geometry'] = merged_geometry_geojson
        world_territories.append(merged_territory)

    world_territories_geojson = dict(
        type='FeatureCollection',
        features=world_territories
    )
    with geojson_output_path.open('w') as f:
        json.dump(world_territories_geojson, f)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Natural Earth Shapefile to GeoJSON Converter"
    )
    parser.add_argument(
        "INPUT",
        type=Path,
        help="Path to the Natural Earth shapefile to convert.",
    )
    parser.add_argument(
        "OUTPUT",
        type=Path,
        help="Path to the GeoJSON output file.",
    )
    args = parser.parse_args()
    na_shp2geojson(args.INPUT, args.OUTPUT)
